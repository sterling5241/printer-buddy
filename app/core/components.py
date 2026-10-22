from __future__ import annotations

import json
import logging
import os
import subprocess
import time
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / "printer-buddy.env"
STATE = ROOT / "data" / "parts"
UPDATES_URL = "https://raw.githubusercontent.com/sterling5241/printer-buddy/HEAD/updates.txt"
# part -> (env var holding its tier, tiers, file or folder it installs)
PARTS = {
    "ui": ("PB_UI", ("basic", "advanced"), ROOT / "ui"),
    "notify": ("PB_NOTIFY", ("basic", "advanced"), ROOT / "app" / "core" / "notify.py"),
    "timelapse": (None, (), ROOT / "app" / "media" / "timelapse.py"),
    "streamer": ("PB_STREAM", ("off", "light", "basic", "full"), ROOT / "streamer"),
}
REQUIRED = ("ui", "notify", "timelapse")
AI_KINDS = ("off", "basic", "heavy")
_cache: dict = {}


def ensure_parts():
    missing = [n for n in REQUIRED if not PARTS[n][2].exists()]
    if not missing:
        return
    log.warning("parts missing (%s), downloading them", ", ".join(missing))
    try:
        subprocess.run(["bash", str(ROOT / "install.sh"), "--parts"], cwd=ROOT, timeout=600, check=False)
    except (OSError, subprocess.TimeoutExpired) as ex:
        log.error("couldn't download the parts (%s): run ./install.sh --parts", ex)


def env_get(key: str, default: str = "") -> str:
    v = os.getenv(key)
    if v is not None:
        return v.strip()
    try:
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return default


def env_set(key: str, value: str):
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    lines = [ln for ln in lines if not ln.startswith(f"{key}=")] + [f"{key}={value}"]
    ENV_FILE.write_text("\n".join(lines) + "\n")
    os.environ[key] = value


def _cached(key: str, ttl: float, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        value = fn()
    except Exception as ex:
        log.info("%s: %s", key, ex)
        value = hit[1] if hit else None
    _cache[key] = (time.time(), value)
    return value


def latest() -> dict:
    """updates.txt: {(part, channel or tier): version}."""
    def fetch():
        req = urllib.request.Request(UPDATES_URL, headers={"User-Agent": "printer-buddy", "Cache-Control": "no-cache"})
        text = urllib.request.urlopen(req, timeout=15).read().decode()
        out = {}
        for line in text.splitlines():
            bits = line.split()
            if len(bits) == 3 and not line.startswith("#"):
                out[(bits[0], bits[1])] = bits[2]
        return out
    return _cached("updates", 600, fetch) or {}


def _git(*args) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, timeout=20).stdout.strip()


CHANNEL_BRANCH = {"stable": "builds", "nightly": "nightly"}


def core_branch() -> str:
    """The branch core updates follow: the channel's, unless another branch was picked in the installer."""
    cur = _git("rev-parse", "--abbrev-ref", "HEAD")
    if cur in ("", "HEAD", "main", *CHANNEL_BRANCH.values()):
        return CHANNEL_BRANCH.get(env_get("PB_CHANNEL", "stable"), "builds")
    return cur


def core() -> dict:
    cur, want = _git("rev-parse", "--abbrev-ref", "HEAD"), core_branch()
    remote = _cached(f"core:{want}", 600, lambda: (_git("ls-remote", "origin", f"refs/heads/{want}").split() or [""])[0][:7])
    have = _git("rev-parse", "--short=7", "HEAD")
    ver = latest().get(("core", "stable")) if want == "builds" else None
    return {"installed": f"{cur} {have}", "latest": f"{want} {ver or remote}" if remote else None,
            "update": bool(remote) and (cur != want or remote != have)}


def _newer(a: str, b: str) -> bool:
    """Is version a (e.g. v1.10) newer than b (v1.9)?"""
    def nums(v):
        return [int(x) for x in v.lstrip("v").replace("-", ".").split(".") if x.isdigit()]
    return nums(a) > nums(b)


def _stamp(name: str) -> tuple[str, str]:
    try:
        tag, _, when = (STATE / name).read_text().strip().partition(" ")
        return tag, when
    except OSError:
        return "", ""


def components(ai_tag: str | None) -> dict:
    channel = env_get("PB_CHANNEL", "stable") or "stable"
    avail = latest()
    parts = []
    for name, (var, tiers, path) in PARTS.items():
        tag, when = _stamp(name)
        if var and env_get(var, tiers[0]) == "off":
            parts.append({"name": name, "installed": "off", "latest": None, "update": False, "tier": "off", "tiers": list(tiers)})
            continue
        if channel == "nightly":
            new = avail.get((name, "nightly"))
            update = bool(new) and (tag != f"{name}-nightly" or when[:10] < new)
            show_new = f"nightly {new}" if new else None
            installed = f"nightly {when[:10]}" if tag == f"{name}-nightly" else tag.removeprefix(f"{name}-")
        else:
            new = avail.get((name, "stable"))
            update = bool(new) and (not tag.startswith(f"{name}-v") or _newer(new, tag.removeprefix(f"{name}-")))
            show_new, installed = new, tag.removeprefix(f"{name}-")
        parts.append({"name": name, "installed": installed or ("present" if path.exists() else None), "latest": show_new,
                      "update": update, "tier": env_get(var, tiers[0]) if var else None, "tiers": list(tiers)})
    kind = env_get("PB_AI", "off") or "off"
    ai_new = avail.get(("ai", kind))
    return {"channel": channel, "core": core(), "parts": parts,
            "ai": {"kind": kind, "kinds": list(AI_KINDS), "installed": ai_tag, "latest": ai_new and f"{kind}-{ai_new}",
                   "update": bool(ai_new) and kind != "off" and (not (ai_tag or "").removeprefix("ai-").startswith(f"{kind}-")
                                                                 or _newer(ai_new, (ai_tag or "").removeprefix("ai-").removeprefix(f"{kind}-")))}}


def run(what: str) -> tuple[bool, str]:
    """core | parts | ai | streamer: do the update, return (ok, output)."""
    if what == "core":
        b = core_branch()
        cmd = ["bash", "-c", 'git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" && git fetch -q --prune origin'
               f' && git reset -q --hard && git checkout -q -B {b} origin/{b} && git branch -q -u origin/{b}'
               ' && bash install.sh --parts && .venv/bin/pip install -q -r requirements.txt']
    elif what == "streamer":
        cmd = ["bash", "install.sh", "--streamer"]
    elif what == "parts":
        cmd = ["bash", "install.sh", "--parts"]
    elif what == "ai":
        cmd = ["bash", "-c", '.venv/bin/pip install -q -r requirements-ai.txt && mkdir -p data/ai'
               f' && .venv/bin/python app/ai/model_download.py --kind {env_get("PB_AI", "basic")} --dir data/ai']
    else:
        return False, f"unknown: {what}"
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=900)
    except (OSError, subprocess.TimeoutExpired) as ex:
        return False, str(ex)
    _cache.clear()
    return p.returncode == 0, (p.stdout + p.stderr).strip()[-2000:]
