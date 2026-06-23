# Arcade Coder Stock Firmware Notes

This document summarises what we know about the Tech Will Save Us Arcade Coder stock firmware and the local Python/Web UI we built around it.

## Hardware and Firmware Context

- Device: Tech Will Save Us Arcade Coder.
- Main MCU: ESP32-WROOM-32D.
- Display: 12x12 RGB LED matrix, 144 LEDs total.
- Stock firmware observed: v3.8.1-era firmware image.
- BLE is the main app-facing interface.
- UART debug output is available from board pads and has been very useful.
- The original official app/cloud path appears to no longer be practically available, so this project treats the stock firmware as an offline device to control directly.

## Original App Situation

The original product expected a phone/tablet app to talk to the board. That app is not something we are relying on here. In practice:

- The original app route is effectively dead/unavailable for our purposes.
- We could not depend on the original APK/app ecosystem being installable or functioning.
- Instead of replacing firmware, we mapped out enough of the stock BLE protocol to use the existing firmware.
- This preserves the stock firmware and avoids flashing custom firmware unless we choose to later.

## BLE UUIDs

Known UUIDs used by our tooling:

```text
Service:       778d5426-fa29-4363-91fd-a9f5cfcfce85
Command char:  e18d056b-7dae-49c1-b5f2-17684801e446
Callback char: 21acb4a0-24d0-42f4-8e61-c827daf68d12
Game char:     27f450db-9197-4e02-85fd-9cba87639a28
```

The local web UI sends protobuf-like command messages to the command characteristic and subscribes to the callback characteristic.

## Stock App Model

The firmware is not just a dumb LED display controller. It contains an embedded JavaScript/XS-style virtual machine and built-in modules.

Important idea:

```text
BLE command -> firmware command dispatcher -> built-in module / VM -> matrix output / callback notifications
```

The device can run built-in modules such as:

- `paint`: the useful paint/canvas module.
- `testmode`: confirmed colour-cycle demo/test module.
- `initial-interaction`: default style interaction module.
- `matrix`: appears to be more like a support/library module; starting it directly can produce VM errors.

## Onboard Apps Page

The local UI now has an Onboard Apps page:

```text
http://127.0.0.1:8765/onboard.html
```

It can:

- connect/disconnect BLE
- start `paint`
- start `testmode` as the demo
- start `initial-interaction`
- start `matrix` for completeness

The useful buttons are currently Paint and Demo/Testmode.

## Paint Mode

Paint mode is the breakthrough that made direct LED control reliable.

Workflow:

1. Connect over BLE.
2. Start built-in module `paint`.
3. Send paint commands containing a compact canvas.
4. The module inflates the canvas and updates the LED matrix.

The compact canvas format is:

```text
byte 0: width
byte 1: height
byte 2..n: raw DEFLATE stream
```

For this device:

```text
width  = 12
height = 12
inflated payload = 12 * 12 * 3 = 432 bytes
```

Each pixel is three bytes. On the UI side we treat colours as display RGB, then swap red and blue before sending because the device/display path behaves like BGR/GRB-ish ordering from our perspective.

Example compact canvas:

```text
0c0c6318050c4306b08adc0100
```

This inflates to 432 bytes and lights the bottom-right pixel in the captured paint state.

## Why Invalid Short Payloads Behaved Weirdly

Earlier experiments mutated arbitrary hex bytes in compact canvas payloads. Some of those payloads inflated to the wrong length, for example 429 or 431 bytes instead of 432.

The device sometimes accepted those invalid/truncated payloads and displayed unstable or stateful results. This explained observations where sending the same short/mutated payload could appear to change colours or produce odd pixels.

The current reliable path is:

```text
build full 432-byte display buffer -> raw DEFLATE -> send compact canvas
```

This avoids random byte mutation weirdness.

## Uploading Games / Apps

The firmware has a Game upload path over the Game characteristic. The intended model seems to be uploading games/apps into the VM, then starting them by name.

We learned that the Game protobuf fields are not the same as the first guesses from descriptor parsing. Corrected understanding from testing and code reading:

- Game field 1: required string, purpose still not fully understood.
- Game field 2: runtime name used by logs/startGame.
- Game field 3: optional VM/load argument string.
- Game field 4: Costume message.
- Costume field 1: costume/name string.
- Costume field 2: bytecode/data field, not a normal long JavaScript source string.

Plain JavaScript source uploads hit size/schema limits, such as string overflow. Extracted `.xsb`/bytecode fragments could be uploaded in some cases but often crashed when started because the VM expects correct module/heap context, not arbitrary isolated function bytes.

Current practical conclusion:

- Uploading full working custom apps to stock firmware is still unresolved.
- Built-in `paint` is the reliable control surface.
- We can build external apps in Python/browser and send frames to `paint`.


### App Bundle Continuation Notes

The app-upload path is not solved, but it is worth keeping because this is how someone may eventually make true stock-firmware apps.

What worked:

- Saving a named app worked once Game field 2 was used as the runtime name.
- Starting by that saved name reached the VM loader and produced logs with the chosen name.

What did not work yet:

- Empty-code uploads could save but crashed when started.
- Plain JavaScript source hit serializer/string-size limits.
- Extracted bytecode fragments could upload but were not complete standalone VM bundles.
- Larger or malformed writes could fail in Bleak/WinRT or crash the board.

For a fuller handoff, see `docs/APP_BUNDLE_NOTES.md` in the repo.
## Built-In 	estmode / Demo

`testmode` is confirmed useful as a demo/onboard test. Starting it cycles colours on the device.

In our UI this is exposed as **Demo / Testmode**.

## Bleak / Windows BLE Issues

We had several practical BLE issues on Windows using Bleak:

- Some write-with-response calls failed or hung.
- Some operations were cancelled by WinRT with errors like `WinError -2147023673`.
- Writing large payloads can fail with parameter errors if sent as one oversized BLE write.
- Connecting/subscribing to notifications sometimes caused the board to flash and enter an unresponsive state during early probing.
- COM/UART access conflicts happened when another terminal already had COM3 open.
- The device can crash/reboot if malformed protobuf/game payloads are sent.

Current mitigations:

- Prefer known-good command shapes.
- Use `response=False` for many BLE writes where appropriate.
- Keep payloads valid and small enough for the platform path.
- Use UART logs when testing new firmware behaviours.
- Start `paint` once, then send normal compact canvas commands.
- Avoid arbitrary probing unless we have UART attached and are ready to reboot.

## Local UI Pages

Main local server:

```text
http://127.0.0.1:8765/
```

Important pages:

```text
/onboard.html      Start built-in stock modules such as paint/testmode
/pixelgrid.html    Click pixels and send calculated one/multi-pixel canvases
/experiments.html  Metrics, Wordle, Aurora, resources, audio visualizer
/animations.html   Scriptable 12x12 animation runtime
/hexlab.html       Byte-level compact canvas lab
/observe.html      Observation workflow
/sweep.html        Payload sweep workflow
```

## Current Recommended Control Path

For normal development:

1. Run the local server:

```bat
venv\Scripts\python.exe app\server_live.py
```

2. Open:

```text
http://127.0.0.1:8765/onboard.html
```

3. Click **Scan** and select your Arcade Coder.
4. Click **Use Selected**.
5. Connect.
6. Start Paint.
7. Use Pixel Grid, Experiments, or Animations pages to send frames.

For shared/git use, do not assume the original development MAC address. The server still accepts `--address` as a fallback/manual override, but the normal path is to scan from the Onboard Apps page and select the device found on the current machine.

## Why This Works Without Custom Firmware

The stock firmware already has everything we need:

- BLE command parser.
- Built-in `paint` VM/module.
- Matrix output path.
- Raw DEFLATE compact canvas decoder.

Our UI simply generates valid compact canvas frames and sends them through the same path the original app likely used.

## Open Questions

- Exact complete VM app upload format.
- Whether full custom XSB modules can be reconstructed and uploaded cleanly.
- Complete list of built-in modules.
- Exact low-level LED driver colour order.
- Whether button/accelerometer events can be exposed usefully without a custom uploaded app.
- Whether a future custom firmware path is worth it now that stock paint control works.
