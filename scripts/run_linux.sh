#!/usr/bin/env sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "This runner is for Linux/Raspberry Pi OS/DietPi only." >&2
  exit 1
fi

REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_DIR"

if [ ! -x venv/bin/python ]; then
  echo "Missing venv/bin/python. Run this first:" >&2
  echo "  sh scripts/install_linux.sh" >&2
  exit 1
fi

exec venv/bin/python app/server_live.py --host 0.0.0.0 --no-uart "$@"
