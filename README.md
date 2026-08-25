# LightyCoderDoodad

LightyCoderDoodad is a toolkit  for the Tech Will Save Us Arcade Coder. It controls the original 12x12 LED hardware over BLE without replacing the stock firmware.

There are now two proven ways to use the board:

1. **Stream displays through stock Paint** — send images and animation frames from a computer.
2. **Run custom programs onboard** — upload compact JavaScript games that execute inside the stock firmware’s embedded XS VM.

The repository includes a Python web server, Scratch-style block editor, animation and image tools, protocol utilities, hardware findings, an Android controller, and an experimental AI animation studio.

## Current capabilities

### Native programs and Arcade Blocks

Custom programs can be encoded as a named `Game` protobuf, saved over BLE, and started by name at a selected tick rate. Hardware testing has confirmed onboard JavaScript execution, multiple sprites, colour, native movement, update callbacks, continuous edge bouncing, and directional tilt forwarding.

`app/static/scratch.html` provides **Arcade Blocks**, this project’s own Blockly-based Scratch-style editor. It does not copy the original product UI and does not require npm or a frontend build step.

Current block families include:

- Events: program start, shake, four-direction tilt, and sprite bounce.
- Sprites A-D: create, place, move, set velocity, change colour, show, and hide.
- Loops: forever behavior and actions every N ticks.
- Control: bounce all sprites or one named sprite.
- Random actions: colour, velocity, and position.

The compiler emits the small, hardware-tested Arcade Engine JavaScript subset, converts display RGB to the board’s native colour order, rejects known-dangerous source patterns, and validates the complete upload payload before transmission.

Open Arcade Blocks at <http://127.0.0.1:8765/scratch.html>.

See:

- [Arcade Blocks setup and supported blocks](docs/SCRATCH_SETUP.md)
- [Native programming roadmap](docs/NATIVE_PROGRAMMING_ROADMAP.md)
- [How the firmware and protocols work](docs/HOW_IT_WORKS.md)

### Paint, images, and streamed animations

The stock `paint` module accepts compact 12x12 RGB canvases while it is running. The web tools can send:

- Hand-painted pixel grids.
- Loaded, cropped, and downsampled images.
- Script-generated animations.
- AI-generated animation scripts.
- Text, numbers, experiments, and diagnostic frames.

Each frame expands to 432 RGB bytes. Frames are sent using raw DEFLATE, but the stock firmware has a confirmed decompression bug with normal LZ77 backreferences: zlib default/dynamic and fixed-Huffman streams can corrupt the final pixels or rows without producing a UART error.

LightyCoderDoodad therefore uses **Huffman-only DEFLATE** for Paint canvases. It avoids general match-distance copying, renders correctly on hardware, and is normally smaller than uncompressed/stored blocks. RLE and stored modes remain available on the Animations page for diagnostics.

## Native upload safety and UART

UART is **not required** to upload or run a valid native program. It is only a diagnostic connection that exposes firmware logs such as save/start messages, JavaScript exceptions, stack overflows, and reboot reasons.

Arcade Blocks asks users to acknowledge that uploaded code executes natively and malformed code may freeze or reboot the board. Without UART, detailed device-side errors will not be visible. The checkbox does not claim that UART is connected.

The command-line sender uses the equivalent flag:

```powershell
--accept-native-code-risk
```

The older `--i-have-uart-attached` spelling remains as a compatibility alias.

Known source safety rules include:

- Keep the complete Game payload within the currently proven single-write path.
- Do not generate column-zero top-level `var`; the stock loader evaluates those lines in a separate context.
- Do not use IIFE state wrappers; one test overflowed the Game VM task stack and rebooted the ESP32.
- Prefer live sprite references from `Engine.spriteClasses`.

## Upload and storage limits

The current application conservatively limits a Game upload to 512 bytes because that is the observed Windows/Bleak single-operation boundary, not because the board only has 512 bytes of storage.

Stock built-in applications are compiled into firmware flash and are much larger. The original app may have used denser source/costume encoding, a different BLE long-write procedure, or another transfer route. Each ordinary write to the Game characteristic is currently decoded as one complete protobuf; naïvely sending two halves does not append them.

Important remaining work includes larger/multipart programs, compact multi-pixel costume assets, and a runtime data route for uploaded games. The generic uploaded-game `post` handler currently only exposes the stock pause/resume behavior.

## Quick start

From the `LightyCoderDoodad` directory:

```bat
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe scripts\scan_devices.py --save-first-likely
venv\Scripts\python.exe app\server_live.py
```

Open:

- Main UI: <http://127.0.0.1:8765/>
- Onboard modules: <http://127.0.0.1:8765/onboard.html>
- Images: <http://127.0.0.1:8765/images.html>
- Animations: <http://127.0.0.1:8765/animations.html>
- Arcade Blocks: <http://127.0.0.1:8765/scratch.html>
- Experiments: <http://127.0.0.1:8765/experiments.html>

UART-free startup:

```bat
venv\Scripts\python.exe app\server_live.py --no-uart
```

Included launchers:

```bat
start_ui.bat              :: default, no UART
start_ui_no_uart.bat      :: explicit no-UART mode
start_ui_with_uart.bat    :: UART logging enabled
start_ui_no_env.bat       :: system Python, no UART
```

## Repository map

- `app/` — local Python board server and browser tools.
- `ai_animation/` — LM Studio-backed animation generator and board proxy.
- `stock_protocol/` — BLE UUIDs, protobuf encoding, commands, and Game helpers.
- `scripts/` — scanning, module starting, pixel, canvas, and diagnostic tools.
- `tests/` — native protocol, block compiler, and Paint compression regression checks.
- `docs/` — setup, architecture, reverse-engineering findings, and roadmap.
- `android/` — native Android controller and debug APK.
- `web_bluetooth/` — browser-only Paint MVP using Web Bluetooth, with no Python backend.
- `examples/esp32_arcade_paint/` — direct BLE control from another ESP32.

## Device address selection

The tools choose the BLE address in this order:

1. An explicit `--address` option.
2. The `LIGHTY_CODER_ADDRESS` environment variable.
3. `device_config.json`, created by scanning or selecting a device.
4. The development fallback address.

Scan and save a board:

```bat
venv\Scripts\python.exe scripts\scan_devices.py
venv\Scripts\python.exe scripts\scan_devices.py --save YOUR_DEVICE_ADDRESS
```

## Command examples

```bat
venv\Scripts\python.exe scripts\start_module.py paint
venv\Scripts\python.exe scripts\start_module.py testmode
venv\Scripts\python.exe scripts\send_canvas.py br --start
venv\Scripts\python.exe scripts\send_pixel.py 11 11 --colour red --start
```

## AI Animation Studio

`ai_animation/` asks a model served by LM Studio to generate JavaScript animations for the display. It runs on a computer that can reach both LM Studio and the LightyCoderDoodad board server.

| Service | Typical host | Default port |
| --- | --- | ---: |
| LM Studio API | PC | `3000` |
| Board server | PC or Raspberry Pi | `8765` or `8766` |
| AI Animation Studio | PC | `8770` |

```bat
python ai_animation\server.py --host 0.0.0.0 --port 8770 --board http://PI_IP:8765 --lmstudio http://127.0.0.1:3000
```

Open <http://127.0.0.1:8770/>. The AI frontend and its proxy explicitly request the firmware-safe Huffman-only Paint encoding.

The AI studio has no authentication. Do not expose port 8770 directly to the public internet.

## Android and microcontroller clients

Open `android/` in Android Studio or run `open_android_studio.bat`. See [android/README.md](android/README.md). A debug APK is included under `android/apk/`; building it yourself is the safer trust choice.

The [ESP32 paint example](examples/esp32_arcade_paint) starts stock Paint and sends pre-compressed canvases directly over BLE.

## Status and open work

Hardware-proven:

- Starting stock built-ins including Paint and test mode.
- Reliable Paint frames with Huffman-only compression.
- Named custom Game upload, save, and start.
- Native JavaScript execution at a nonzero tick rate.
- Sprite rendering, movement, multiple sprites, update callbacks, and bouncing.
- Directional tilt events reaching the stock game wrapper.
- Scratch-style compilation and direct browser upload.

Still under development or awaiting focused hardware tests:

- Multipart/larger Game transfer and compact costume assets.
- First hardware validation of the new timing, random, nested bounce-action, and sensor listener blocks.
- Shake activation; the exposed board could not safely be shaken hard enough for a conclusive test.
- Numeric pitch/roll or raw accelerometer values; the public Engine currently exposes directional events only.
- Arbitrary live BLE messages into uploaded programs.
- Portable project import/export and a native-program simulator.

## Documentation

- [Setup](docs/SETUP.md)
- [How it works](docs/HOW_IT_WORKS.md)
- [Arcade Blocks](docs/SCRATCH_SETUP.md)
- [Native programming roadmap](docs/NATIVE_PROGRAMMING_ROADMAP.md)
- [App bundle notes](docs/APP_BUNDLE_NOTES.md)
- [Server variants](docs/SERVER_FILES.md)
- [Scripts](docs/SCRIPTS.md)
- [Android app](android/README.md)
