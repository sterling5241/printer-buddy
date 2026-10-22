#!/usr/bin/env bash
# Printer Buddy's root helper: the only command the app may run with sudo (see install.sh install_helper).
set -euo pipefail
STREAMER=printer-buddy-streamer

case "${1:-}" in
  pkg)
    case "${2:-}" in
      ffmpeg|v4l-utils|ustreamer|python3-venv)
        apt-get install -y -q "$2" || { apt-get update -q && apt-get install -y -q "$2"; } ;;
      *) echo "not an allowed package: ${2:-}"; exit 2 ;;
    esac ;;
  deps)
    case "${2:-}" in
      light|basic) apt-get install -y -q ustreamer v4l-utils ;;
      full)
        apt-get install -y -q ffmpeg v4l-utils
        if ! command -v go2rtc >/dev/null; then
          case "$(uname -m)" in
            x86_64|amd64) a=amd64 ;; aarch64|arm64) a=arm64 ;; armv7l) a=arm ;; armv6l) a=armv6 ;;
            *) echo "no go2rtc build for $(uname -m)"; exit 1 ;;
          esac
          curl -fsSL -o /usr/local/bin/go2rtc "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_$a"
          chmod 755 /usr/local/bin/go2rtc
        fi ;;
      *) exit 2 ;;
    esac ;;
  unit)
    dir="${2:-}"; user="${3:-}"
    [ -d "$dir/streamer/streamer" ] && [ -x "$dir/.venv/bin/python" ] || { echo "no streamer in $dir"; exit 2; }
    uid="$(id -u "$user" 2>/dev/null)" && [ "$uid" != 0 ] || { echo "bad user"; exit 2; }
    cat > "/etc/systemd/system/$STREAMER.service" <<UNIT
[Unit]
Description=Printer Buddy camera streamer
After=network-online.target
Wants=network-online.target

[Service]
User=$user
SupplementaryGroups=video
WorkingDirectory=$dir/streamer
ExecStart=$dir/.venv/bin/python -m streamer -c $dir/data/streamer.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload ;;
  enable) systemctl enable -q --now "$STREAMER" ;;
  restart) systemctl restart "$STREAMER" ;;
  disable) systemctl disable -q --now "$STREAMER" 2>/dev/null || true ;;
  reboot) systemctl reboot ;;
  shutdown) systemctl poweroff ;;
  *) echo "usage: $0 pkg <package> | deps light|basic|full | unit <printer-buddy dir> <user> | enable | restart | disable | reboot | shutdown"; exit 2 ;;
esac
