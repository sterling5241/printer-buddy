#!/usr/bin/env bash
#   ./install.sh                         open the menu
#   ./install.sh -y                      install/update with no questions (keeps current setup)
#   ./install.sh --ui advanced --ai off  set parts and install with no menu
#   ./install.sh -y --port 8081          install on a set port (must be free)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE=printer-buddy
UNIT_FILE="/etc/systemd/system/$SERVICE.service"
RUN_USER="${SUDO_USER:-$USER}"
ENV_FILE="$DIR/printer-buddy.env"
BACKUP_DIR="$DIR/backups"
PARTS_STATE="$DIR/data/parts"
ASVC="$(getent passwd "$RUN_USER" | cut -d: -f6)/printer_data/moonraker.asvc"
HELPER=/usr/local/lib/printer-buddy/streamer-root.sh
PORT_GIVEN=""
INTERACTIVE=0

# key|env var|name|choices (first one is the default)
PARTS=(
  "ui|PB_UI|Interface|basic advanced"
  "ai|PB_AI|AI detection|off basic heavy"
  "video|PB_VIDEO|Video|snapshots live timelapse"
  "notify|PB_NOTIFY|Notifications|basic advanced"
  "remote|PB_REMOTE|Remote access|off on"
  "stream|PB_STREAM|Camera streamer|off light basic full"
  "channel|PB_CHANNEL|Release channel|stable nightly"
)
declare -A DESC=(
  [ui.basic]="dashboard, Quick View, printer status page"
  [ui.advanced]="Basic + Control, Console, Files, History, list view, groups"
  [ai.off]="no failure detection"
  [ai.basic]="light model, runs on a Pi"
  [ai.heavy]="bigger, more accurate model; needs a strong PC or GPU"
  [video.snapshots]="camera pictures, refreshed every few seconds"
  [video.live]="smooth live stream"
  [video.timelapse]="live stream + a timelapse of every print"
  [notify.basic]="ntfy / Discord when prints start, pause, finish or fail"
  [notify.advanced]="Basic + more services and progress updates"
  [remote.off]="only on your home network"
  [remote.on]="reach it from anywhere, with a login"
  [stream.off]="use the printer's own camera service"
  [stream.light]="1 camera, MJPEG (ustreamer)"
  [stream.basic]="every USB / Pi camera, MJPEG (ustreamer)"
  [stream.full]="+ network cameras, WebRTC (go2rtc); needs more CPU"
  [channel.stable]="tested releases (v1.x)"
  [channel.nightly]="newest builds, may have bugs"
)
BUILT=" ui.basic ui.advanced ai.off ai.basic ai.heavy video.snapshots notify.basic notify.advanced video.live video.timelapse remote.off remote.on stream.off stream.light stream.basic stream.full channel.stable channel.nightly "

W=55
hr()    { printf '|%s|\n' "$(printf '%*s' $((W + 2)) '' | tr ' ' '-')"; }
top()   { printf '/%s\\\n' "$(printf '%*s' $((W + 2)) '' | tr ' ' '=')"; }
bottom(){ printf '\\%s/\n' "$(printf '%*s' $((W + 2)) '' | tr ' ' '=')"; }
row()   { local s="${1:0:$W}"; printf '| %s%*s |\n' "$s" $((W - ${#s})) ''; }
center(){ local t="$1" pad=$(( (W - ${#1}) / 2 )); printf '| %*s%-*s |\n' "$pad" '' $((W - pad)) "$t"; }
ask()   { local a; read -r -p "$1" a </dev/tty || a=""; printf '%s' "${a,,}"; }
pause() { read -r -p "Press Enter to go back..." _ </dev/tty || true; }
yesno() { case "$(ask "$1 [y/N] ")" in y|yes) return 0 ;; *) return 1 ;; esac; }

ensure_env() { [ -f "$ENV_FILE" ] || cp "$DIR/printer-buddy.env.example" "$ENV_FILE"; }
get_env() { { grep -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | tr -d '[:space:]'; }
set_env() {
  ensure_env
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
built() { case "$BUILT" in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
part_value() {
  local key var name choices; IFS='|' read -r key var name choices <<<"$1"
  local v; v="$(get_env "$var")"
  case " $choices " in *" $v "*) echo "$v" ;; *) echo "${choices%% *}" ;; esac
}

installed() { [ -f "$UNIT_FILE" ]; }
service_state() {
  if ! installed; then echo "not installed"
  elif systemctl is-active --quiet "$SERVICE"; then echo "running"
  else echo "stopped"; fi
}
url() { local ip port; ip=$(hostname -I 2>/dev/null | awk '{print $1}'); port="$(get_env PORT)"; echo "http://${ip:-<this-box>}:${port:-8080}"; }

current_port() { local p; p="$(get_env PORT)"; echo "${p:-8080}"; }
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]; }
port_owner() {
  local p="$1" line pid name ours
  ours="$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null)"
  if command -v ss >/dev/null; then
    line="$( { sudo -n ss -ltnp "sport = :$p" 2>/dev/null || ss -ltnp "sport = :$p" 2>/dev/null; } | tail -n +2 | head -n1)"
    [ -n "$line" ] || return 1
    pid="$(printf '%s' "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p')"
    name="$(printf '%s' "$line" | sed -n 's/.*users:(("\([^"]*\)".*/\1/p')"
    [ -n "$pid" ] && [ "$pid" = "$ours" ] && return 1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null || return 1
  fi
  # can't see who owns it, but Printer Buddy is running on this port: that's us
  if [ -z "${pid:-}" ] && systemctl is-active --quiet "$SERVICE" && [ "$p" = "$(current_port)" ]; then return 1; fi
  case "$name" in
    mjpg_streamer|ustreamer|camera-streamer|crowsnest) name="$name (webcam streamer)" ;;
    "") name="another program" ;;
  esac
  echo "$name"
}
next_free_port() {   # first free port after $1
  local p
  for p in $(seq $(( $1 + 1 )) $(( $1 + 50 ))); do
    [ "$p" -le 65535 ] || break
    port_owner "$p" >/dev/null || { echo "$p"; return 0; }
  done
  return 1
}
ask_port() {   # ask until a valid, free port is typed; prints it. Enter cancels.
  local p owner
  while true; do
    p="$(ask "Port (1024-65535, Enter to cancel): ")"
    [ -n "$p" ] || return 1
    valid_port "$p" || { echo "  Must be a number from 1024 to 65535." >&2; continue; }
    if owner="$(port_owner "$p")"; then echo "  $p is in use by: $owner. Pick another." >&2; continue; fi
    echo "  $p is free." >&2
    echo "$p"; return 0
  done
}
choose_port() {   # make sure PORT in printer-buddy.env is free before (re)starting
  local p owner alt c
  p="${PORT_GIVEN:-$(current_port)}"
  valid_port "$p" || { echo "Port must be a number from 1024 to 65535 (got: $p)."; return 1; }
  printf 'Checking port %s ... ' "$p"
  if ! owner="$(port_owner "$p")"; then
    echo "free"; set_env PORT "$p"; echo "Using port $p"; return 0
  fi
  echo "in use by: $owner"
  if [ -n "$PORT_GIVEN" ]; then echo "Pick a different port with --port."; return 1; fi
  alt="$(next_free_port "$p")" || { echo "No free port found after $p."; alt=""; }
  if [ "$INTERACTIVE" = 1 ]; then
    echo
    [ -n "$alt" ] && echo "  1) Use $alt (free)       <- default"
    echo "  2) Pick another port"
    echo
    if [ -n "$alt" ]; then c="$(ask "Choice [1]: ")"; else c=2; fi
    if [ "$c" = "2" ]; then
      p="$(ask_port)" || { echo "Cancelled. Nothing was installed."; return 1; }
    else
      p="$alt"
    fi
  else
    [ -n "$alt" ] || { echo "Pick a free port with --port."; return 1; }
    echo "Port $p in use by $owner, using $alt instead."; p="$alt"
  fi
  set_env PORT "$p"; echo "Saved PORT=$p to printer-buddy.env"
}
port_hint() {   # why didn't it start? say so if the port is taken
  local o
  if o="$(port_owner "$1")"; then echo "Port $1 is taken by $o. Pick 'P) Change port' in the menu, or run: ./install.sh --port <number>"
  else echo "Pick 'Show logs' to see why."; fi
}
change_port() {
  echo; echo "Printer Buddy is set to port $(current_port)."
  local p; p="$(ask_port)" || { echo "Nothing changed."; return 0; }
  [ "$p" = "$(current_port)" ] && { echo "That's already the port. Nothing changed."; return 0; }
  set_env PORT "$p"; echo "Saved PORT=$p to printer-buddy.env"
  if installed; then hard_restart && echo "Printer Buddy is now at $(url)"; fi
  if [ -n "$(get_env PB_TUNNEL_KEY)" ]; then
    echo "Updating your share-link tunnel to the new port..."
    tunnel_call POST >/dev/null && echo "Tunnel updated." || echo "Couldn't update the tunnel; try Remote access > 1) Set up automatically."
  elif [ "$(tunnel_state)" != "not set up" ]; then
    echo "Your share-link tunnel still points at the old port. Run Remote access > 1) Set up automatically to update it."
  fi
}

UPDATE_INFO=""
NEED_LOGIN=0
check_updates() {
  NEED_LOGIN=0
  git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1 || { UPDATE_INFO=""; return; }
  local out
  if out=$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true timeout 15 git -C "$DIR" fetch -q 2>&1); then
    local behind; behind=$(git -C "$DIR" rev-list --count HEAD..@{u} 2>/dev/null || echo "")
    if [ -z "$behind" ]; then UPDATE_INFO=""
    elif [ "$behind" = "0" ]; then UPDATE_INFO="up to date"
    else UPDATE_INFO="$behind update(s) available"; fi
  elif printf '%s' "$out" | grep -qiE "username|authentication|403|401|terminal prompts disabled|could not read"; then
    UPDATE_INFO="GitHub login needed"; NEED_LOGIN=1
  else UPDATE_INFO="couldn't check for updates"; fi
}

github_login() {
  local remote host; remote="$(git -C "$DIR" remote get-url origin 2>/dev/null)"
  case "$remote" in https://*) ;; *) echo "This copy doesn't use an https:// GitHub address, so there's nothing to save."; return 1 ;; esac
  host="${remote#https://}"; host="${host%%/*}"; host="${host#*@}"
  echo; echo "Log in to $host so Printer Buddy can check for and download updates."
  echo "Paste a GitHub token (a read-only one for this repo is enough)."
  local user="x-access-token" token   # GitHub only checks the token; the username can be anything
  read -r -s -p "  Token (hidden): " token </dev/tty || return 1; echo
  [ -n "$token" ] || { echo "Nothing saved."; return 1; }
  git -C "$DIR" config credential.helper store
  printf 'protocol=https\nhost=%s\nusername=%s\npassword=%s\n\n' "$host" "$user" "$token" | git -C "$DIR" credential approve
  check_updates
  if [ $NEED_LOGIN -eq 1 ]; then
    printf 'protocol=https\nhost=%s\nusername=%s\npassword=%s\n\n' "$host" "$user" "$token" | git -C "$DIR" credential reject
    echo "GitHub didn't accept that login, so it wasn't saved. Check the username and token and try again (menu option 8)."
    return 1
  fi
  echo "Saved. Update checks and updates won't ask again on this box."
}

version() { git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown"; }
branch() { git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"; }
# the branch updates follow: the channel's, unless another branch was picked with G) Switch branch
core_branch() {
  case "$(branch)" in
    nightly|builds|main|HEAD|unknown) [ "$(get_env PB_CHANNEL)" = nightly ] && echo nightly || echo builds ;;
    *) branch ;;
  esac
}

hard_restart() {
  local port; port="$(get_env PORT)"; port="${port:-8080}"
  sudo systemctl stop "$SERVICE"
  local i; for i in $(seq 1 20); do systemctl is-active --quiet "$SERVICE" || break; sleep 0.5; done
  sudo systemctl start "$SERVICE" || { echo "The service failed to start. $(port_hint "$port")"; return 1; }
  command -v curl >/dev/null || { sleep 3; echo "Started."; return 0; }
  printf "Waiting for Printer Buddy to come up"
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$port/healthz" 2>/dev/null; then echo " ok"; return 0; fi
    printf "."; sleep 1
  done
  echo; echo "It started but isn't answering on port $port yet. $(port_hint "$port")"; return 1
}

write_unit() {
  sudo tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Printer Buddy - self-hosted printer monitor
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$DIR
Environment=DB_PATH=$DIR/data/monitor.db
Environment=PORT=8080
EnvironmentFile=-$ENV_FILE
ExecStart=$DIR/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port \${PORT} --timeout-graceful-shutdown 3
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
}

ensure_ffmpeg() {
  [ "$(part_value "${PARTS[2]}")" = "timelapse" ] || return 0
  command -v ffmpeg >/dev/null && return 0
  echo "Installing ffmpeg (needed for timelapses)..."
  sudo apt-get update -q && sudo apt-get install -y -q ffmpeg || echo "Couldn't install ffmpeg; timelapses will save pictures but no video."
}

ai_model() {
  local f; f="$(ls -1t "$DIR"/data/ai/"$(part_value "${PARTS[1]}")"-*/model.json 2>/dev/null | head -n1)"
  [ -n "$f" ] && basename "$(dirname "$f")"
}

ensure_ai() {
  local kind; kind="$(part_value "${PARTS[1]}")"
  [ "$kind" = basic ] || [ "$kind" = heavy ] || return 0
  case "$(uname -m)" in
    aarch64|arm64|x86_64|amd64) ;;
    *) echo "AI detection needs a 64-bit system (this one is $(uname -m)). Skipping AI; everything else works."
       echo "  On a Raspberry Pi, use Raspberry Pi OS (64-bit)."; return 0 ;;
  esac
  echo "Installing AI libraries..."
  "$DIR/.venv/bin/pip" install -r "$DIR/requirements-ai.txt" -q \
    || { echo "Couldn't install the AI libraries. Skipping AI; everything else works."; return 0; }
  mkdir -p "$DIR/data/ai"
  "$DIR/.venv/bin/python" "$DIR/app/ai/model_download.py" --kind "$kind" --dir "$DIR/data/ai" \
    || echo "No AI model yet. AI stays off until one downloads (try 3) Update later)."
  return 0
}

fetch_part() {   # part, release asset, path inside the package, where it goes
  local channel; channel="$(get_env PB_CHANNEL)"
  python3 - "$@" "${channel:-stable}" "$PARTS_STATE" <<'PY' || { echo "Couldn't get the $1 part, kept what was there."; return 1; }
import io, json, os, shutil, sys, tarfile, tempfile, urllib.request
name, asset, inner, dest, channel, state = sys.argv[1:7]
hdr = {"User-Agent": "printer-buddy", "Accept": "application/vnd.github+json"}
api = "https://api.github.com/repos/sterling5241/printer-buddy/releases?per_page=100"
rels = json.load(urllib.request.urlopen(urllib.request.Request(api, headers=hdr), timeout=30))
want = (lambda t: t == f"{name}-nightly") if channel == "nightly" else (lambda t: t.startswith(f"{name}-v"))
rel = next((r for r in rels if want(r["tag_name"]) and not r.get("draft")), None)
if not rel:
    sys.exit(f"no {channel} release of {name} yet")
a = next((x for x in rel.get("assets", []) if x["name"] == asset), None)
if not a:
    sys.exit(f"{rel['tag_name']} has no {asset}")
need = next((l.split(":", 1)[1] for l in (rel.get("body") or "").splitlines() if l.lower().startswith("needs:")), "")
if channel != "nightly" and need.strip() and os.path.exists(dest):
    import glob, subprocess
    root = os.path.dirname(os.path.dirname(state))
    env = {}
    if os.path.exists(os.path.join(root, "printer-buddy.env")):
        env = dict(l.strip().split("=", 1) for l in open(os.path.join(root, "printer-buddy.env")) if "=" in l)
    git = lambda *a: subprocess.run(["git", "-C", root, *a], capture_output=True, text=True).stdout.strip()
    nums = lambda v: [int(x) for x in v.lstrip("v").replace("-", ".").split(".") if x.isdigit()]
    def have(c):   # None = off or not installed, so it doesn't count
        if c == "core":
            return "nightly" if git("rev-parse", "--abbrev-ref", "HEAD") == "nightly" else                 git("describe", "--tags", "--abbrev=0", "--match", "core-v*").split("core-", 1)[-1]
        if c == "ai":
            if env.get("PB_AI", "off") == "off":
                return None
            tags = sorted(json.load(open(m)).get("tag", "") for m in glob.glob(os.path.join(root, "data", "ai", "*", "model.json")))
            return tags[-1].rsplit("-", 1)[-1] if tags else None
        if c == "streamer" and env.get("PB_STREAM", "off") == "off":
            return None
        try:
            t = open(os.path.join(state, c)).read().split()[0]
        except (OSError, IndexError):
            return None
        return "nightly" if t.endswith("-nightly") else t.split("-", 1)[-1]
    miss = []
    for item in need.split(","):
        bits = item.split()
        if len(bits) == 2:
            h = have(bits[0])
            if h != "nightly" and h is not None and (not h or nums(bits[1]) > nums(h)):
                miss.append(item.strip())
    if miss:
        print(f"{name}: {rel['tag_name']} needs {', '.join(miss)} first, kept what was there")
        sys.exit(0)
stamp = f"{rel['tag_name']} {a['updated_at']} {asset}"
mark = os.path.join(state, name)
if os.path.exists(dest) and os.path.exists(mark) and open(mark).read() == stamp:
    sys.exit(0)
data = urllib.request.urlopen(urllib.request.Request(a["browser_download_url"], headers=hdr), timeout=300).read()
tmp = tempfile.mkdtemp()
with tarfile.open(fileobj=io.BytesIO(data)) as t:
    t.extractall(tmp)
src = os.path.join(tmp, inner)
if os.path.isdir(src):
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(src, dest)
else:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(src, dest)
shutil.rmtree(tmp)
os.makedirs(state, exist_ok=True)
open(mark, "w").write(stamp)
print(f"{name}: {rel['tag_name']}")
PY
}

fetch_parts() {
  local ui notify stream bad=0
  ui="$(part_value "${PARTS[0]}")"; notify="$(part_value "${PARTS[3]}")"
  fetch_part ui "print-buddy-ui-$ui.tar.gz" print-buddy-ui "$DIR/ui" || bad=1
  fetch_part notify "print-buddy-notify-$notify.tar.gz" print-buddy-notify/pb_notify/__init__.py "$DIR/app/core/notify.py" || bad=1
  fetch_part timelapse print-buddy-timelapse.tar.gz print-buddy-timelapse/pb_timelapse/__init__.py "$DIR/app/media/timelapse.py" || bad=1
  stream="$(get_env PB_STREAM)"
  if [ -n "$stream" ] && [ "$stream" != off ]; then
    fetch_part streamer "print-buddy-streamer-$stream.tar.gz" print-buddy-streamer "$DIR/streamer" || bad=1
  fi
  return $bad
}

install_helper() {
  sudo install -d -o root -g root -m 755 "$(dirname "$HELPER")" \
    && sudo install -o root -g root -m 755 "$DIR/tools/streamer-root.sh" "$HELPER" || return 1
  local rule="$RUN_USER ALL=(root) NOPASSWD: $HELPER"
  echo "$rule" | sudo tee /etc/sudoers.d/printer-buddy.tmp >/dev/null \
    && sudo visudo -cqf /etc/sudoers.d/printer-buddy.tmp \
    && sudo mv /etc/sudoers.d/printer-buddy.tmp /etc/sudoers.d/printer-buddy && sudo chmod 440 /etc/sudoers.d/printer-buddy \
    || { sudo rm -f /etc/sudoers.d/printer-buddy.tmp; echo "Couldn't set up the sudo rule for the streamer."; return 1; }
}

ensure_streamer() {
  local tier; tier="$(get_env PB_STREAM)"
  if [ -z "$tier" ] || [ "$tier" = off ]; then
    [ -f "$HELPER" ] && sudo -n "$HELPER" disable
    return 0
  fi
  fetch_part streamer "print-buddy-streamer-$tier.tar.gz" print-buddy-streamer "$DIR/streamer" || return 1
  if [ -f "$DIR/data/streamer.conf" ]; then
    sed -i "s/^tier:.*/tier: $tier/" "$DIR/data/streamer.conf"
  else
    mkdir -p "$DIR/data" && sed "s/^tier:.*/tier: $tier/" "$DIR/streamer/streamer.conf.example" > "$DIR/data/streamer.conf"
  fi
  echo "Setting up the camera streamer ($tier)..."
  sudo -n "$HELPER" deps "$tier" && sudo -n "$HELPER" unit "$DIR" "$RUN_USER" && sudo -n "$HELPER" enable && sudo -n "$HELPER" restart \
    || { echo "Couldn't set up the camera streamer."; return 1; }
  if [ -f "$ASVC" ] && ! grep -qx printer-buddy-streamer "$ASVC"; then echo printer-buddy-streamer >> "$ASVC"; fi
}

moonraker_service() {
  [ -f "$ASVC" ] || return 0
  if [ "$1" = add ]; then
    grep -qx "$SERVICE" "$ASVC" || { echo "$SERVICE" >> "$ASVC"; echo "Added $SERVICE to Moonraker's services."; }
  else
    sed -i "/^$SERVICE\$/d" "$ASVC"
  fi
}

do_install() {
  echo; echo "Installing..."
  ensure_env
  local b; b="$(core_branch)"
  if [ "$(branch)" != "$b" ] && git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Switching to the $b branch for the ${b/builds/stable} channel..."
    git -C "$DIR" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
    git -C "$DIR" fetch -q origin && git -C "$DIR" checkout -q -B "$b" "origin/$b" && git -C "$DIR" branch -q -u "origin/$b" \
      || echo "Couldn't switch to $b, staying on $(branch)."
  fi
  fetch_parts || return 1
  if ! python3 -c "import venv, ensurepip" 2>/dev/null; then
    echo "Installing python3-venv..."
    sudo apt-get update && sudo apt-get install -y python3-venv || { echo "Couldn't install python3-venv."; return 1; }
  fi
  [ -d "$DIR/.venv" ] || python3 -m venv "$DIR/.venv" || return 1
  "$DIR/.venv/bin/pip" install --upgrade pip -q && "$DIR/.venv/bin/pip" install -r "$DIR/requirements.txt" -q || { echo "pip install failed."; return 1; }
  mkdir -p "$DIR/data"
  ensure_ffmpeg
  ensure_ai
  choose_port || return 1
  write_unit
  sudo systemctl daemon-reload && sudo systemctl enable -q "$SERVICE" || return 1
  moonraker_service add
  install_helper && ensure_streamer
  hard_restart || return 1
  echo "Printer Buddy is running: $(url)  (open dashboards reload themselves)"
}

do_update() {
  echo; echo "Updating..."
  local b; b="$(core_branch)"
  git -C "$DIR" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
  git -C "$DIR" fetch --prune origin || { echo "Couldn't get the latest from GitHub. Nothing was changed."; return 1; }
  git -C "$DIR" reset --hard && git -C "$DIR" checkout -q -B "$b" "origin/$b" && git -C "$DIR" branch -q -u "origin/$b"     || { echo "Update failed."; return 1; }
  after_code_change || return 1
  echo "Updated to $(git -C "$DIR" log -1 --format='%h %s')"
  check_updates
}

after_code_change() {
  fetch_parts
  if [ -x "$DIR/.venv/bin/pip" ]; then "$DIR/.venv/bin/pip" install -r "$DIR/requirements.txt" -q || return 1; fi
  [ -x "$DIR/.venv/bin/pip" ] && ensure_ai
  installed && install_helper && ensure_streamer
  if installed; then write_unit; hard_restart || return 1; fi
  return 0
}

switch_branch() {
  git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1 || { echo "This copy isn't a git checkout, so it can't switch branch."; return 1; }
  echo; echo "Getting the branch list from GitHub..."
  # a one-branch clone only knows its own branch; make it see (and track) all of them
  git -C "$DIR" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
  GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true timeout 30 git -C "$DIR" fetch -q --prune origin \
    || { echo "Couldn't get the branches (no internet, or GitHub login needed: menu option 8)."; return 1; }
  local cur list b c i=0
  cur="$(branch)"
  mapfile -t list < <(git -C "$DIR" for-each-ref --format='%(refname:strip=3)' refs/remotes/origin | grep -vx HEAD)
  [ ${#list[@]} -gt 0 ] || { echo "No branches found on GitHub."; return 1; }
  echo
  for b in "${list[@]}"; do
    i=$((i + 1))
    if [ "$b" = "$cur" ]; then echo "  $i) $b   <- current"; else echo "  $i) $b"; fi
  done
  echo
  c="$(ask "Switch to (number, Enter = cancel): ")"
  [ -n "$c" ] || { echo "Cancelled. Nothing changed."; return 0; }
  if ! [[ "$c" =~ ^[0-9]+$ ]] || [ "$c" -lt 1 ] || [ "$c" -gt ${#list[@]} ]; then echo "That's not a number from the list. Nothing changed."; return 1; fi
  b="${list[$((c - 1))]}"
  [ "$b" != "$cur" ] || { echo "Already on $b. Use 3) Update to get its latest."; return 0; }
  echo "Switching to $b..."
  git -C "$DIR" reset -q --hard
  git -C "$DIR" checkout -q -B "$b" "origin/$b" && git -C "$DIR" branch -q --set-upstream-to "origin/$b" "$b" \
    || { echo "Switching failed. Nothing else was changed."; return 1; }
  after_code_change || return 1
  echo "Now on $b: $(git -C "$DIR" log -1 --format='%h %s')"
  check_updates
}

restart_service() {
  installed || { echo "Not installed yet; pick Install first."; return 1; }
  hard_restart && echo "Restarted."
}

show_logs() {
  installed || { echo "Not installed yet."; return 1; }
  journalctl -u "$SERVICE" -n 80 --no-pager 2>/dev/null || sudo journalctl -u "$SERVICE" -n 80 --no-pager
}

do_remove() {
  installed || { echo "Not installed."; return 0; }
  yesno "Stop and remove the Printer Buddy service?" || { echo "Nothing changed."; return 0; }
  sudo systemctl disable --now -q "$SERVICE"; sudo rm -f "$UNIT_FILE"; sudo systemctl daemon-reload
  echo "Service removed."
  moonraker_service remove
  if [ -d "$DIR/.venv" ] && yesno "Also delete the Python environment (.venv)?"; then rm -rf "$DIR/.venv" && echo "Deleted .venv."; fi
  if [ -d "$DIR/data" ] && yesno "Also delete your printers and settings (data/)? Make a backup first if unsure."; then rm -rf "$DIR/data" && echo "Deleted data/."; fi
}

make_backup() {
  local dest="$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dest"
  [ -d "$DIR/data" ] && cp -a "$DIR/data" "$dest/"
  [ -f "$ENV_FILE" ] && cp -a "$ENV_FILE" "$dest/"
  echo "Backup saved: ${dest#$DIR/}"
}

restore_backup() {
  local list=() i=1 b
  [ -d "$BACKUP_DIR" ] && while IFS= read -r b; do list+=("$b"); done < <(ls -1 "$BACKUP_DIR" | sort -r)
  [ ${#list[@]} -gt 0 ] || { echo "No backups yet."; return 0; }
  echo; for b in "${list[@]}"; do echo "  $i) $b"; i=$((i + 1)); done
  local n; n="$(ask "Restore which? (number, Enter to cancel) ")"
  [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le ${#list[@]} ] || { echo "Cancelled."; return 0; }
  local src="$BACKUP_DIR/${list[$((n - 1))]}"
  yesno "Replace your current printers and settings with ${list[$((n - 1))]}?" || { echo "Cancelled."; return 0; }
  installed && sudo systemctl stop "$SERVICE"
  if [ -d "$src/data" ]; then rm -rf "$DIR/data" && cp -a "$src/data" "$DIR/data"; fi
  [ -f "$src/printer-buddy.env" ] && cp -a "$src/printer-buddy.env" "$ENV_FILE"
  installed && sudo systemctl start "$SERVICE"
  echo "Restored ${list[$((n - 1))]}."
}

share_domain() { local d; d="$(get_env PB_SHARE_DOMAIN)"; echo "${d:-printerbuddy.stream}"; }
tunnel_state() {
  if ! systemctl list-unit-files cloudflared.service >/dev/null 2>&1 || ! systemctl cat cloudflared >/dev/null 2>&1; then echo "not set up"
  elif systemctl is-active --quiet cloudflared; then echo "running"
  else echo "stopped"; fi
}
user_id() {
  local uid; uid="$(get_env PB_USER_ID)"
  if [ -z "$uid" ]; then
    local port; port="$(get_env PORT)"
    uid="$(curl -fsS --max-time 2 "http://127.0.0.1:${port:-8080}/api/share/user-id" 2>/dev/null | sed -n 's/.*"user_id": *"\([0-9]*\)".*/\1/p')"
    [ -n "$uid" ] || uid="$(( (RANDOM * 32768 + RANDOM) % 9000000 + 1000000 ))"
    set_env PB_USER_ID "$uid"
  fi
  echo "$uid"
}
install_cloudflared() {
  command -v cloudflared >/dev/null && return 0
  echo "Installing cloudflared (Cloudflare's tunnel program)..."
  local arch tmp; arch="$(dpkg --print-architecture 2>/dev/null)"
  case "$arch" in amd64|arm64|armhf|i386) ;; *) echo "Unsupported CPU type: ${arch:-unknown}"; return 1 ;; esac
  tmp="$(mktemp --suffix=.deb)"
  curl -fsSL -o "$tmp" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb" \
    && sudo dpkg -i "$tmp" >/dev/null || { rm -f "$tmp"; echo "Couldn't install cloudflared."; return 1; }
  rm -f "$tmp"
}
start_tunnel() {
  if [ "$(tunnel_state)" != "not set up" ]; then sudo cloudflared service uninstall >/dev/null 2>&1; fi
  if sudo cloudflared service install "$1" >/dev/null 2>&1; then
    sleep 3
    if systemctl is-active --quiet cloudflared; then echo "Tunnel is running."
    else echo "The tunnel was set up but isn't running yet. See: journalctl -u cloudflared -n 30"; fi
  else
    echo "cloudflared didn't accept that token. Nothing else was changed."; return 1
  fi
  if [ "$(part_value "${PARTS[4]}")" != "on" ]; then
    yesno "Remote access is off in your setup, so share links won't work. Turn it on now?" && { set_env PB_REMOTE on; installed && hard_restart; }
  fi
  return 0
}
tunnel_api() { local a; a="$(get_env PB_TUNNEL_API)"; echo "${a:-https://www.$(share_domain)/api/tunnel}"; }
json_get() { python3 -c 'import sys, json
try: print(json.load(sys.stdin).get(sys.argv[1]) or "")
except Exception: print("")' "$1"; }
tunnel_call() {
  local method="$1" uid port key body resp code err
  uid="$(user_id)"; port="$(current_port)"; key="$(get_env PB_TUNNEL_KEY)"
  body="{\"id\": \"$uid\", \"port\": $port${key:+, \"key\": \"$key\"}}"
  resp="$(curl -sS --max-time 90 -X "$method" -H "content-type: application/json" -d "$body" -w '\n%{http_code}' "$(tunnel_api)" 2>&1)" \
    || { echo "Couldn't reach $(tunnel_api): $resp" >&2; return 1; }
  code="${resp##*$'\n'}"; resp="${resp%$'\n'*}"
  if [ "${code:0:1}" != "2" ]; then
    err="$(json_get error <<<"$resp")"
    echo "Setup server said: ${err:-HTTP $code}" >&2; return 1
  fi
  echo "$resp"
}
auto_tunnel() {
  install_cloudflared || return 1
  echo "Setting up wireless sharing for box $(user_id) on port $(current_port)..."
  local resp token key
  resp="$(tunnel_call POST)" || return 1
  token="$(json_get token <<<"$resp")"; key="$(json_get key <<<"$resp")"
  [ -n "$token" ] || { echo "The setup server didn't send a tunnel token."; return 1; }
  [ -n "$key" ] && set_env PB_TUNNEL_KEY "$key"
  start_tunnel "$token" || return 1
  echo "Share links now work from anywhere: https://www.$(share_domain)/share/user/$(user_id)/..."
}
remove_tunnel() {
  local key; key="$(get_env PB_TUNNEL_KEY)"
  [ "$(tunnel_state)" = "not set up" ] && [ -z "$key" ] && { echo "No tunnel is set up."; return 0; }
  yesno "Remove the tunnel? Share links will stop working from outside." || { echo "Nothing changed."; return 0; }
  [ "$(tunnel_state)" != "not set up" ] && sudo cloudflared service uninstall >/dev/null 2>&1 && echo "Tunnel stopped on this box."
  if [ -n "$key" ]; then
    echo "Removing it from the server..."
    local i; for i in 1 2 3; do
      if tunnel_call DELETE >/dev/null; then set_env PB_TUNNEL_KEY ""; echo "Tunnel removed."; return 0; fi
      [ $i -lt 3 ] && { echo "Retrying in 20 s..."; sleep 20; }
    done
    echo "The server still has it. Try 2) Remove tunnel again in a few minutes."; return 1
  fi
}
remote_menu() {
  local c
  while true; do
    clear 2>/dev/null || true
    top; center "REMOTE ACCESS / SHARE LINKS"; hr
    row "Remote access:  $(part_value "${PARTS[4]}")"
    row "Tunnel:         $(tunnel_state)"
    row "Your ID:        $(user_id)"
    row "Links look like:"
    row "  https://www.$(share_domain)/share/user/$(user_id)/..."
    hr
    row "1) Set up automatically"
    row "2) Remove tunnel"
    row ""; row "B) Back"; bottom
    c="$(ask "Perform action: ")"
    case "$c" in
      1) auto_tunnel; pause ;;
      2) remove_tunnel; pause ;;
      b|back|"") return ;;
    esac
  done
}

setup_lines() {
  local part key var name choices v note
  for part in "${PARTS[@]}"; do
    IFS='|' read -r key var name choices <<<"$part"
    v="$(part_value "$part")"; note=""; built "$key.$v" || note="(coming soon)"
    if [ "$key" = "ai" ] && [ "$v" != "off" ]; then
      local m; m="$(ai_model)"; note="${m:+(model $m)}"; note="${note:-(no model yet)}"
    fi
    row "$(printf '%-15s %-11s %s' "$name" "$v" "$note")"
  done
}

main_menu() {
  local first=1 c
  INTERACTIVE=1
  ensure_env
  echo "Checking for updates..."; check_updates
  if [ $NEED_LOGIN -eq 1 ] && yesno "This copy needs a GitHub login to get updates. Log in now?"; then github_login; pause; fi
  while true; do
    clear 2>/dev/null || true
    top; center "PRINTER BUDDY"; hr
    local st; st="$(service_state)"
    if [ "$st" = "running" ]; then row "Service:  ● running   $(url)"; else row "Service:  ○ $st"; fi
    row "Version:  $(version) on $(branch)${UPDATE_INFO:+ ($UPDATE_INFO)}"
    hr; setup_lines; hr
    if installed; then row "$(printf '%-28s%s' '1) Reinstall' '5) Restart service')"; else row "$(printf '%-28s%s' '1) Install' '5) Restart service')"; fi
    row "$(printf '%-28s%s' '2) Change setup' '6) Show logs')"
    row "$(printf '%-28s%s' '3) Update' '7) Remove')"
    row "$(printf '%-28s%s' '4) Backup / restore data' '8) GitHub login')"
    row "$(printf '%-28s%s' '9) Remote / share links' 'P) Change port')"
    row "$(printf '%-28s%s' 'G) Switch branch' '')"
    row ""; row "Q) Quit"; bottom
    c="$(ask "Perform action: ")"
    case "$c" in
      1) do_install; pause ;;
      2) setup_menu ;;
      3) do_update; pause ;;
      4) backup_menu ;;
      5) restart_service; pause ;;
      6) show_logs; pause ;;
      7) do_remove; pause ;;
      8) github_login; pause ;;
      9) remote_menu ;;
      p|port) change_port; pause ;;
      g|branch) switch_branch; pause ;;
      q|quit|exit) echo "Bye."; exit 0 ;;
      *) ;;
    esac
  done
}

setup_menu() {
  local changed=0 c part key var name choices
  while true; do
    clear 2>/dev/null || true
    top; center "CHANGE SETUP"; hr
    local i=1
    for part in "${PARTS[@]}"; do
      IFS='|' read -r key var name choices <<<"$part"
      local v note=""; v="$(part_value "$part")"; built "$key.$v" || note="(coming soon)"
      row "$(printf '%d) %-15s %-11s %s' "$i" "$name" "$v" "$note")"; i=$((i + 1))
    done
    row ""; row "B) Back"; bottom
    c="$(ask "Pick a part: ")"
    case "$c" in
      b|back|"")
        if [ $changed -eq 1 ] && installed; then fetch_parts; ensure_ffmpeg; ensure_ai; install_helper && ensure_streamer; hard_restart && echo "Restarted with the new setup."; sleep 1; fi
        return ;;
    esac
    [[ "$c" =~ ^[0-9]+$ ]] && [ "$c" -ge 1 ] && [ "$c" -le ${#PARTS[@]} ] || continue
    part="${PARTS[$((c - 1))]}"
    IFS='|' read -r key var name choices <<<"$part"
    local opts; read -r -a opts <<<"$choices"
    local cur; cur="$(part_value "$part")"
    echo; echo "$name:"
    local j=1 o mark note
    for o in "${opts[@]}"; do
      mark=""; [ "$o" = "$cur" ] && mark="  <- current"
      note=""; built "$key.$o" || note=" (not built yet)"
      printf "  %d) %-10s %s%s%s\n" "$j" "$o" "${DESC[$key.$o]}" "$note" "$mark"; j=$((j + 1))
    done
    local a; a="$(ask "  Choice (Enter to keep ${cur}): ")"
    if [[ "$a" =~ ^[0-9]+$ ]] && [ "$a" -ge 1 ] && [ "$a" -le ${#opts[@]} ]; then a="${opts[$((a - 1))]}"; fi
    case " $choices " in *" $a "*) [ "$a" != "$cur" ] && { set_env "$var" "$a"; changed=1; } ;; esac
  done
}

backup_menu() {
  local c
  while true; do
    clear 2>/dev/null || true
    top; center "BACKUP / RESTORE"; hr
    row "Backs up your printers and settings (data/ and"
    row "printer-buddy.env) into backups/."
    hr; row "1) Make a backup"; row "2) Restore a backup"; row ""; row "B) Back"; bottom
    c="$(ask "Perform action: ")"
    case "$c" in
      1) make_backup; pause ;;
      2) restore_backup; pause ;;
      b|back|"") return ;;
    esac
  done
}

if [ $# -eq 0 ] && { [ -t 0 ] || [ -r /dev/tty ]; }; then main_menu; fi

declare -A GIVEN=()
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) shift ;;
    -h|--help) echo "Usage: ./install.sh [-y] [--port N] [--ui basic|advanced] [--ai off|basic|heavy] [--video snapshots|live|timelapse] [--notify basic|advanced] [--remote off|on] [--stream off|light|basic|full] [--channel stable|nightly] [--parts] [--streamer]"; exit 0 ;;
    --parts) ensure_env; fetch_parts; exit $? ;;
    --streamer) ensure_env; ensure_streamer; exit $? ;;
    --port)
      [ $# -ge 2 ] || { echo "--port needs a number"; exit 1; }
      valid_port "$2" || { echo "--port must be a number from 1024 to 65535"; exit 1; }
      PORT_GIVEN="$2"; shift 2 ;;
    --ui|--ai|--video|--notify|--remote|--stream|--channel)
      [ $# -ge 2 ] || { echo "$1 needs a value"; exit 1; }
      GIVEN[${1#--}]="${2,,}"; shift 2 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
done
ensure_env
for part in "${PARTS[@]}"; do
  IFS='|' read -r key var name choices <<<"$part"
  if [ -n "${GIVEN[$key]:-}" ]; then
    case " $choices " in *" ${GIVEN[$key]} "*) set_env "$var" "${GIVEN[$key]}" ;; *) echo "--$key must be one of: $choices"; exit 1 ;; esac
  else
    set_env "$var" "$(part_value "$part")"
  fi
done
do_install
