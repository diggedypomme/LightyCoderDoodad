# Setup

## Requirements

- Windows 10/11 with Bluetooth support.
- Python 3.11 or newer.
- A Tech Will Save Us Arcade Coder powered on and advertising over BLE.

## Install

```bat
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Pick your device

Use either the UI scan button or the command line scan tool:

```bat
venv\Scripts\python.exe scripts\scan_devices.py
venv\Scripts\python.exe scripts\scan_devices.py --save-first-likely
```

This writes `device_config.json`. That file is intentionally ignored by git because every user has their own BLE address.

## Start the UI

```bat
venv\Scripts\python.exe app\server_live.py
```

Then open http://127.0.0.1:8765/.

## Pages

- `/onboard.html` starts onboard modules and includes the main notes.
- `/pixelgrid.html` sends calculated one-pixel or multi-pixel canvases.
- `/images.html` loads, crops, downsamples, saves, and sends images.
- `/animations.html` previews and sends script-generated 12x12 animations.
- `/experiments.html` contains dashboard-style experiments such as AuroraWatch, system resources, Wordle entry, and audio visualisation.
- `/hexlab.html`, `/observe.html`, and `/sweep.html` are lower-level investigation tools.
