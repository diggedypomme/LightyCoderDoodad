# Arcade Blocks setup

## What it is

Arcade Blocks is this project's own Scratch-style programming interface for the stock Arcade Coder firmware. It does not copy the original product UI.

- Blockly 12.5.1 supplies the open-source block workspace.
- Our small compiler translates blocks into the compact Arcade Engine JavaScript subset recovered and tested on the device.
- The Python server validates the generated program, builds the Game protobuf, uploads it over BLE, and starts it onboard.
- Blockly is loaded from the unpkg CDN. There is no npm, node_modules directory, bundler, or frontend build step.

## Run it

With UART already open in PuTTY, start the normal server:

```powershell
venv\Scripts\python.exe LightyCoderDoodad\app\server.py
```

Open:

```text
http://127.0.0.1:8765/scratch.html
```

Use the actual port printed by the server if it differs. After changing the editor code, use Ctrl+F5 so the browser does not retain an old `scratch.js`.

## Current block palette

### Events

- `when program starts`: the single program root.
- `set up`: creates sprites and performs one-time actions.
- `forever`: actions compiled into the board's native 8 Hz update callback.

### Sprites

Up to four named sprites (`A` through `D`) are supported.

- `make sprite`: name, one-pixel colour, initial x/y, and x/y velocity.
- `set sprite position`
- `set sprite velocity`
- `move sprite by`
- `set sprite colour`
- `show/hide sprite`

Coordinates are 1 through 12. Velocity is currently -1, 0, or 1 per tick. Display colours are translated to the board's observed native BGR costume order.

### Loops

- `every N ticks do`: runs nested actions at an interval from 1 to 80 update ticks.

At the default 8 Hz, 4 ticks is 0.5 seconds and 8 ticks is 1 second. This counter representation avoids the IIFE pattern that rebooted the device in the unsafe `engreset` experiment. The generator output is structurally checked, but the new timing path still needs its first hardware confirmation.

### Control

- `bounce all sprites`: horizontal, vertical, or every edge.
- `bounce sprite A-D`: the same behavior for one named sprite.

## Test examples

`Load Trio Example` reproduces the hardware-proven three-light animation.

`Load Blink Example` is the next focused test. It creates sprite A at the centre and changes it blue every four ticks and red every eight ticks. At 8 Hz it should alternate blue/red twice per second, with red winning on every eighth tick.

Give each uploaded test a fresh short name such as `blink1`. Tick the native-code risk acknowledgement before upload. Keep UART attached when available; without it, firmware errors will not be visible.

## Compiler and safety rules

- A program must contain exactly one root and at least one sprite.
- Sprite names must be unique and actions may only target sprites that exist.
- Generated Game payloads must stay at or below the observed 512-byte BLE single-write limit.
- Column-zero top-level `var` is not generated because the stock loader extracts it into a separate eval context.
- IIFEs are not generated; `engreset` showed that construction can overflow the Game VM task stack and reboot the ESP32.
- Upload requires explicit acknowledgement that native code can freeze or reboot the board. UART is recommended for diagnostics but is not required. `Check Build` performs no BLE write.

## Why there is no costume painter yet

The original app exposed a 12x12 artwork/costume editor. That is a sensible next feature, but embedding an uncompressed 144-pixel costume directly in source can exceed the whole 512-byte upload ceiling before any behavior is added.

The next asset milestone is therefore:

1. add a 12x12 painter to our existing pixel-grid UI;
2. encode sparse/indexed artwork compactly;
3. prove how the stock Engine accepts multi-pixel costume data;
4. add costume selection/switching blocks;
5. investigate chunked upload or another transfer route for larger programs.

## Files

- `app/static/scratch.html`: editor page and pinned CDN scripts.
- `app/static/scratch.js`: block definitions, categories, project conversion, examples, persistence, and upload controls.
- `app/static/scratch_codegen.js`: dependency-free safe source generator.
- `app/server.py`: build/upload API routes.
- `stock_protocol/arcade_coder.py`: Game protobuf and start command.
- `tests/test_scratch_codegen.cjs`: generator regression tests.
- `tests/test_native_game_protocol.py`: protocol and backend validation tests.

## Next steps

1. Hardware-test `Load Blink Example` and record UART plus visible behavior.
2. Test position, velocity, colour, show/hide, and targeted bounce blocks in a small candidate batch.
3. Add the compact 12x12 costume pipeline.
4. Add project JSON import/export and an onboard 12x12 preview.
5. Add variables, conditions, collisions, and random values.
6. Return to buttons and accelerometer blocks after the exposed board can be handled safely.
7. Treat richer live BLE messaging as a separate bridge milestone; the recovered generic uploaded-game `post` route only exposes pause/resume.


## Events and randomness expansion

The editor now also exposes:

- `when device is shaken do`
- `when device tilts left/right/forward/back do`
- `when sprite A-D bounces at an edge do`
- `set sprite to a random colour`
- `set sprite to a random velocity`
- `put sprite at a random position`

The nested bounce event performs the edge test, reverses the relevant velocity, and then executes its child blocks once. This directly expresses programs such as “when A bounces, change A to a random colour.” The `Load Random Bounce` example generates 429 source characters.

Random actions use the recovered `Engine.mathRandomInt(min,max)`. Random colour independently chooses the three 0-255 device colour channels. Random velocity chooses each axis from -1, 0, or 1, so it can occasionally select (0,0). Random position chooses x and y from 1 through 12.

Directional tilt forwarding is hardware-confirmed by the wrapper's UART `Left!` and `Right!` messages. Listener-generated behavior still needs a focused test. Shake registration is recovered exactly as `Engine.WhenShaken(listener)`, but physical shake activation remains inconclusive because the exposed board could not safely be shaken hard. The public uploaded-game Engine exposes categorical tilt events only; no numeric pitch, roll, or accelerometer-vector getter has been recovered.

## Why two Game writes do not currently combine

The Game characteristic handler decodes each characteristic write as one complete Game protobuf. There is no recovered append offset, chunk number, completion command, or reassembly buffer in that path. Sending the first half and then the second half would therefore present two invalid protobufs; sending two valid same-name Games would save/replace complete games, not concatenate their JavaScript.

BLE may fragment a single long characteristic operation below the application layer—this already happens despite the displayed MTU of 23—but that is different from issuing two application writes. Supporting programs beyond the current ceiling needs one of:

1. a recovered multipart command understood by the stock firmware;
2. a tiny onboard loader that can receive and reassemble data through another proven channel;
3. a different characteristic/storage route;
4. much denser source and artwork encoding;
5. replacement firmware.

The first practical move remains compact encoding, while separately testing whether the observed approximately 512-byte ceiling belongs to Windows/Bleak, the characteristic value, or the firmware decoder.
