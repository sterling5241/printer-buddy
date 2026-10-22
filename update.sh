#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
git fetch
git reset --hard
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
"$DIR/.venv/bin/pip" install -r requirements.txt -q
sudo systemctl restart printer-buddy
echo "Updated to $(git log -1 --format='%h %s')"
