#!/usr/bin/env sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer is for Linux/Raspberry Pi OS/DietPi only." >&2
  exit 1
fi

REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_DIR"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

APT="apt-get"
if ! command -v apt-get >/dev/null 2>&1; then
  APT="apt"
fi
if ! command -v "$APT" >/dev/null 2>&1; then
  echo "This installer expects apt/apt-get. Install bluetooth, bluez, and python venv support manually." >&2
  exit 1
fi

$SUDO "$APT" update

if ! command -v python3 >/dev/null 2>&1; then
  $SUDO "$APT" install -y python3
fi

PY_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
VENV_PACKAGE="python${PY_VERSION}-venv"
if ! apt-cache show "$VENV_PACKAGE" >/dev/null 2>&1; then
  VENV_PACKAGE="python3-venv"
fi

$SUDO "$APT" install -y bluetooth bluez "$VENV_PACKAGE"

if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now bluetooth || true
fi

if [ ! -x venv/bin/python ]; then
  python3 -m venv venv
fi

venv/bin/python -m pip install --upgrade pip
venv/bin/python -m pip install -r requirements.txt

echo
echo "Install complete."
echo "Scan for the board:"
echo "  venv/bin/python scripts/scan_devices.py --save-first-likely"
echo
echo "Start the web UI without UART:"
echo "  sh scripts/run_linux.sh"
echo
echo "If port 8765 is already in use:"
echo "  sh scripts/run_linux.sh --port 8766"
