#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
b="$(git rev-parse --abbrev-ref HEAD)"
case "$b" in
  nightly|builds|main|HEAD) grep -q "^PB_CHANNEL=nightly" printer-buddy.env 2>/dev/null && b=nightly || b=builds ;;
esac
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch --prune origin
git reset --hard
git checkout -q -B "$b" "origin/$b"
git branch -q -u "origin/$b"
bash "$DIR/install.sh" --parts
"$DIR/.venv/bin/pip" install -r requirements.txt -q
sudo systemctl restart printer-buddy
echo "Updated to $(git log -1 --format='%h %s')"
