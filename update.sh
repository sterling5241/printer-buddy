#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
git fetch
git reset --hard
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
UI_DIR="$(dirname "$DIR")/print-buddy-ui"
if [ -d "$UI_DIR/.git" ]; then
  git -C "$UI_DIR" fetch
  git -C "$UI_DIR" reset --hard "origin/$(git -C "$UI_DIR" rev-parse --abbrev-ref HEAD)"
else
  git -c credential.helper=store clone https://github.com/sterling5241/print-buddy-ui.git "$UI_DIR"
fi
"$DIR/.venv/bin/pip" install -r requirements.txt -q
sudo systemctl restart printer-buddy
echo "Updated to $(git log -1 --format='%h %s')"
