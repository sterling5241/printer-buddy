#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$DIR/app/core/updater.py" update || echo "Some parts didn't update, see above."
sudo systemctl restart printer-buddy
echo "Updated to $(git -C "$DIR" log -1 --format='%h %s')"
