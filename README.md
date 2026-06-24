# LightyCoderDoodad

LightyCoderDoodad is a public handoff/project repo for the Tech Will Save Us Arcade Coder.

It has two connected sides:

1. **Stock app/protocol mapping** - notes and tools for understanding how the original stock firmware talks over BLE, runs onboard modules, and accepts app/game bundles.
2. **Usable controllers** - a Python web UI, command-line scripts, and an Android scaffold that use the working stock `paint` path to control the 12x12 LED matrix without changing firmware.

The currently reliable path is: start the stock onboard `paint` module, then send compact canvas frames over BLE.

## Project Tracks

### 1. Stock App / Protocol Continuation Work

This is the handoff material for people who want to continue figuring out the original app model.

Important findings so far:

- The board uses an ESP32 and exposes a BLE service with command, callback, and game/app upload characteristics.
- The firmware contains onboard modules such as `paint`, `testmode`, `initial-interaction`, and `matrix`.
- The firmware appears to run onboard and uploaded app bundles through an embedded VM.
- The game/app upload path is real: we got named app saves working.
- The corrected app name field is `Game.field2`; once that was used, logs showed names like `Saved game 'testclone'` and `Starting game 'testclone'`.
- Uploading a named bundle is not the same as having a valid runnable bundle. Plain JavaScript hit serializer limits, and isolated bytecode fragments were not complete standalone VM apps.
- The exact complete bundle/container format is still unresolved.

Start here if you want to continue that side:

- [How the stock app path works](docs/HOW_IT_WORKS.md)
- [App bundle notes / continuation work](docs/APP_BUNDLE_NOTES.md)
- [Reference notes](docs/reference/README.md)

### 2. Usable UI / Control Tools

This is the practical side: use the device as a small 12x12 BLE display while leaving stock firmware in place.

Included controllers:

- `app/` - local Python web UI and backend.
- `scripts/` - command-line tools for scanning, starting modules, sending canvases, and sending pixels.
- `android/` - native Android controller scaffold.
- `stock_protocol/` - small BLE/protobuf helper used by the Python tools.
- `examples/esp32_arcade_paint/` - Arduino ESP32 sketch showing direct BLE control from another microcontroller.

The web UI includes:

- Onboard module starter.
- Pixel grid sender.
- Image loader/crop/downsample sender.
- Animation runner.
- Experiments page.
- Lower-level hex/observe/sweep tools.

## Quick Start: Web UI

```bat
python -m venv venv
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

If you do not have UART connected, start with:

```bat
venv\Scripts\python.exe app\server_live.py --no-uart
```

Batch launchers are also included:

```bat
start_ui.bat              :: default, no UART
start_ui_no_uart.bat      :: explicit no-UART mode
start_ui_with_uart.bat    :: UART logging enabled
start_ui_no_env.bat       :: no venv, uses system python, no UART
```

## Device Address

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

## Command Examples

```bat
venv\Scripts\python.exe scripts\start_module.py paint
venv\Scripts\python.exe scripts\start_module.py testmode
venv\Scripts\python.exe scripts\send_canvas.py br --start
venv\Scripts\python.exe scripts\send_pixel.py 11 11 --colour red --start
```

## Microcontroller Example

An ESP32 Arduino sketch is included at [examples/esp32_arcade_paint](examples/esp32_arcade_paint). It connects over BLE, starts the stock `paint` module, and sends a few pre-compressed one-pixel canvas commands.

## Android App

Open this folder in Android Studio:

```text
LightyCoderDoodad/android
```

Or run:

```bat
open_android_studio.bat
```

See [Android app](android/README.md).

A debug APK is included at [android/apk/LightyCoderDoodad-debug.apk](android/apk/LightyCoderDoodad-debug.apk), with the usual warning: build from source if you want to be sensible, because random APKs from GitHub are a trust decision.

## Documentation

- [Setup](docs/SETUP.md)
- [How the stock app path works](docs/HOW_IT_WORKS.md)
- [App bundle notes / continuation work](docs/APP_BUNDLE_NOTES.md)
- [Server file differences](docs/SERVER_FILES.md)
- [Scripts](docs/SCRIPTS.md)
- [Android app](android/README.md)

## Current Status

Working:

- Start `paint`.
- Start `testmode` demo.
- Send compact canvas frames.
- Generate one-pixel and multi-pixel canvases.
- Load/downsample images in the web UI.
- Run generated animations in the web UI.

Still open:

- Complete stock app bundle format.
- Running custom uploaded apps cleanly through the stock VM.
- Full button/accelerometer forwarding without custom firmware.
- Polishing/build-testing the Android app on hardware.
