# LightyCoderDoodad

Local tools for using the Tech Will Save Us Arcade Coder after the original app ecosystem disappeared.

The current working path uses the stock onboard `paint` module and sends compact canvas payloads over BLE. It does not require changing the firmware.

## What is included

- `app/` - local web UI and Python backend.
- `scripts/` - command-line tools for scanning, starting onboard modules, sending canvases, and sending pixels.
- `stock_protocol/` - small BLE/protobuf helper used by the app and scripts.
- `docs/` - setup notes, protocol notes, app-bundle handoff notes, and server notes.
- `android/` - native Android controller scaffold.

## Quick start

```bat
py -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe scripts\scan_devices.py --save-first-likely
venv\Scripts\python.exe app\server_live.py
```

Open:

- Web UI: http://127.0.0.1:8765/
- Onboard apps/docs: http://127.0.0.1:8765/onboard.html
- Images: http://127.0.0.1:8765/images.html
- Experiments: http://127.0.0.1:8765/experiments.html
- Animations: http://127.0.0.1:8765/animations.html

## Device address

The app and scripts choose the BLE address in this order:

1. `--address` command-line option, where available.
2. `LIGHTY_CODER_ADDRESS` environment variable.
3. `device_config.json`, created by scanning or selecting a device in the UI.
4. A fallback address from the original development device.

For a shared checkout, scan first:

```bat
venv\Scripts\python.exe scripts\scan_devices.py
venv\Scripts\python.exe scripts\scan_devices.py --save YOUR_DEVICE_ADDRESS
```

Or use the Onboard Apps page and press `Scan`, then `Use Selected`.

## Documentation

- [Setup](docs/SETUP.md)
- [How the stock app path works](docs/HOW_IT_WORKS.md)
- [App bundle notes / continuation work](docs/APP_BUNDLE_NOTES.md)
- [Server file differences](docs/SERVER_FILES.md)
- [Scripts](docs/SCRIPTS.md)
- [Android app](android/README.md)

## Command examples

```bat
venv\Scripts\python.exe scripts\start_module.py paint
venv\Scripts\python.exe scripts\start_module.py testmode
venv\Scripts\python.exe scripts\send_canvas.py br --start
venv\Scripts\python.exe scripts\send_pixel.py 11 11 --colour red --start
```

## Notes

The stock firmware appears to run onboard modules and uploaded app bundles through a small embedded VM. The most useful built-in module for remote control is `paint`: once it is running, compact canvas payloads can update the LED matrix.

Some older experiments attempted app uploads. Those findings are kept only as background notes because direct upload is not needed for the current working path.