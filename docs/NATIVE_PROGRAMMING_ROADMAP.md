# Native Programming and Scratch Roadmap

## Product goal

The goal is not merely to upload one animation. It is to make the stock Arcade Coder programmable as a general target: programs run on the device, can react to its controls and sensors, can exchange live data over BLE, and can ultimately be authored with Scratch-style blocks.

## Current status

The transport and basic runtime foundation are proven on unmodified stock firmware:

- A named custom Game protobuf can be uploaded over BLE and saved.
- Ordinary embedded-XS-compatible JavaScript in `Game.field3` is compiled and executed onboard.
- The start command can select an update frequency; 8 Hz is confirmed.
- A custom Sprite can be rendered and moved by the native Engine loop.
- `engmove` is the basic native-motion regression test; `engbounce2` is the canonical continuous-JavaScript-animation result.

This proves native execution. It does not yet prove general control, a stable high-level programming API, large projects, or Scratch integration.

## Work layers

1. **Upload and execution — proven.** Keep `engmove` as the regression test.
2. **Reliable animation runtime — current milestone.** Prove continuous motion, boundary logic, multiple Sprites, costume changes, and repeatable timing using self-running programs.
3. **Stable runtime facade.** Wrap the firmware's awkward Engine object shapes behind a small, tested API for sprites, coordinates, motion, colour, timing, input, and collisions.
4. **Input events — parked for safe hardware handling.** Resume shake, tilt, and button testing when the exposed device is reassembled or can be manipulated safely.
5. **BLE live-control bridge.** Build on the confirmed pause/resume route and investigate options for richer computer-to-program messages.
6. **Program representation and compiler.** Define a small intermediate program model, then compile it to compact Engine JavaScript instead of making Scratch know firmware quirks.
7. **Scratch/Blockly editor.** Map blocks such as “when started”, “forever”, “move”, “go to”, “set colour”, loops, variables, and later physical inputs/messages onto the intermediate model.
8. **Larger projects and assets.** Resolve upload chunking or another transfer strategy once generated programs exceed the observed roughly 512-byte single-write ceiling.
9. **Install/run UX.** Save named programs, start/stop them, show UART/BLE diagnostics, and preserve a reproducible project format.

## Immediate animation test batch

`engbounce` saved and started correctly at 8 Hz, but its first callback failed with `TypeError: ?: cannot coerce to instance`. Direct property access through the top-level captured `Dot` did not avoid the object-identity problem.

The stock loader extracts every line beginning at column zero with `var` and evaluates that context separately from the ordinary `new Function("Engine", "Costumes", body)` program body. The next batch removes top-level `var` declarations and isolates four behaviors:

| Runtime | Payload | Purpose | Expected display |
|---|---|---|---|
| `engbounce2` | `hardware_test/engbounce2.bin` (329 B) | **Proven:** live collection lookup plus direct properties | Source-red/device-blue light bounced continuously |
| `enghelper` | `hardware_test/enghelper.bin` (361 B) | **Proven:** live collection plus `GetX`/`SetSpeed` helpers | Green light bounced continuously |
| `engreset` | `hardware_test/engreset.bin` (330 B) | **Unsafe:** IIFE/state experiment | Game VM stack overflow and ESP32 reboot; do not rerun |
| `engmulti` | `hardware_test/engmulti.bin` (334 B) | **Proven:** callback-free three-Sprite control | Multiple lights moved successfully |

Run each separately with UART attached and allow several seconds before starting the next:

```powershell
venv\Scripts\python.exe app_upload_v2\send_game_upload.py --payload hardware_test\engbounce2.bin --name engbounce2 --frequency 8 --accept-native-code-risk --send
venv\Scripts\python.exe app_upload_v2\send_game_upload.py --payload hardware_test\enghelper.bin --name enghelper --frequency 8 --accept-native-code-risk --send
venv\Scripts\python.exe app_upload_v2\send_game_upload.py --payload hardware_test\engreset.bin --name engreset --frequency 8 --accept-native-code-risk --send
venv\Scripts\python.exe app_upload_v2\send_game_upload.py --payload hardware_test\engmulti.bin --name engmulti --frequency 8 --accept-native-code-risk --send
```

`engmulti`, `engbounce2`, and `enghelper` are hardware-confirmed. `enghelper` proves the stock coordinate and speed helpers work with a Sprite class retrieved from the live collection. Do not rerun `engreset`: it caused a Game VM task stack overflow and board reboot.
## Complex animation test: `trio`

The next hardware candidate is a continuously bouncing three-light animation:

- source: `app_upload_v2/test_packages/15_engine_bouncing_trio.js`
- payload: `hardware_test/trio.bin`
- runtime: `trio`
- source size: 422 characters
- payload size: 437 bytes
- frequency: 8 Hz

It registers one Sprite class containing three Sprites:

- source red/device blue moves horizontally;
- green moves vertically;
- source blue/device red moves diagonally;
- a shared `WhenGameUpdates` callback iterates all three and reverses the relevant velocity at each edge.

It deliberately uses the proven normal source-body/live-Sprite pattern and does not use an IIFE. The new behavior under test is a nested `Array.forEach` callback over multiple live Sprites.

```powershell
venv\Scripts\python.exe app_upload_v2\send_game_upload.py --payload hardware_test\trio.bin --name trio --frequency 8 --accept-native-code-risk --send
```

Expected start packet: `080012060a047472696f1a050d00000041`. Expected display: three differently coloured lights repeatedly cross the screen along horizontal, vertical, and diagonal paths.

## Next implementation sequence

After `trio` is hardware-validated, stop treating every feature as an isolated hand-written payload and turn the proven rules into a small programming toolchain:

1. **Safe source generator and validator.** Generate normal-body code, reject top-level `var` extraction and IIFEs, expose live Sprite lookup, apply RGB-to-device red/blue conversion, and enforce the 512-byte transport ceiling before upload.
2. **Animation primitives.** Add generated operations for create Sprite, set position/speed, bounce at edge, multiple Sprites, and simple `forever` update callbacks. Keep `engbounce2`, `enghelper`, `engmulti`, and `trio` as regression fixtures.
3. **Costume animation and timing.** Establish a safe state pattern without IIFEs, then test multi-pixel costumes, costume switching, frame counters, delays, show/hide, and controlled animation sequences.
4. **Minimal Scratch vertical slice.** Define a small intermediate project model and compile blocks such as `when started`, `forever`, `create light`, `move`, `bounce on edge`, and `set colour` into the safe JavaScript subset.
5. **Upload UI integration.** Let the existing application compile, size-check, upload, start, and report BLE/UART errors for generated programs.
6. **Inputs and richer BLE later.** Resume physical sensors/buttons only when the exposed board is safe to handle. Treat arbitrary live BLE messages as a separate bridge problem; stock uploaded-game `post` currently only exposes pause/resume.

The immediate engineering deliverable after the test is therefore the safe generator/validator, followed by a tiny Scratch-compatible intermediate model—not more ad-hoc Engine API guessing.
## Parked physical-input test

`engshake` started cleanly and the wrapper logged multiple `Right!` and `Left!` tilt events, but no `Shake!`. The board is currently unscrewed and exposed on the desk, so it cannot safely be shaken vigorously. The absence of `Shake!` is therefore an **inconclusive physical test**, not evidence that `Engine.WhenShaken` is broken. Preserve the payload and findings, but do not spend more hardware time on accelerometer behavior until the device can be handled safely.
## BLE control evidence

Command type 3 is an inbound string route from the computer to the active VM:

```text
Command.field1 = 3
Command.field5.field1 = UTF-8 string payload
```

The handler at `FUN_400de048` logs `POSTED: %s`, enters the current game wrapper at VM state offset `+0x48`, looks up XS property ID `0xffff81a9`, and calls it with the posted string. Firmware bytecode for built-in modules shows their corresponding `post(payload)` implementations parsing the string with `JSON.parse`; examples react to `"home-button-press"`.

Important caveat: the generic uploaded `GameWrapper` does not yet reveal a source-level `post` registration hook in the recovered public Engine export. Do not assume that a top-level `function post(...)` or `Engine.post(...)` works until the wrapper binding is traced or tested. This is the next offline reverse-engineering target because it is the natural path for live Scratch control.

## Architecture direction

Scratch blocks should target a small compiler/runtime layer owned by this project:

```text
Scratch-style blocks
        -> project intermediate model
        -> compact Arcade Engine JavaScript
        -> Game protobuf upload
        -> stock firmware VM
```

Live commands and telemetry can use BLE alongside the installed program once the generic `post` and callback paths are fully recovered. Keeping block semantics separate from firmware details will let the UI evolve without embedding reverse-engineered object-shape rules in every block.
## Built-in app corpus

A complete first-pass decompilation now covers all eleven embedded XS archives and 60 named functions. The readable summary is `stock_reverse/BUILTIN_XS_DECOMPILATION.md`; detailed reports are in `stock_reverse/ghidra_reports/xs_modules/`.

This changes the BLE plan: the stock generic `GameWrapper.post(payload)` only toggles pause when `JSON.parse(payload) === "home-button-press"`. Remote pause/resume is available now, but arbitrary Scratch live messages need an additional bridge design.
## Arcade Blocks implementation status

The first safe generator/validator and Scratch-style editor slice is implemented:

- pinned Blockly browser distribution via CDN, with no npm/build tooling;
- custom program, light, and bounce blocks;
- browser-local workspace persistence;
- compact normal-body JavaScript generation with device colour conversion;
- exact server-side 512-byte validation and unsafe-pattern rejection;
- direct Game upload and 8 Hz start from the web UI;
- protocol and generator regression tests.

The next block milestone is named Sprite targeting plus position/speed/show/hide operations. Timing/costume blocks follow after a safe non-IIFE state representation is proven. Physical-input blocks remain parked until the board is safe to handle.

## 2026-07-18 Arcade Blocks expansion

The minimal editor is now a usable named-sprite compiler rather than only a trio demo. Its own UI has Events, Sprites, Loops, and Control categories, with sprite A-D creation, position, velocity, relative movement, colour, visibility, all/targeted edge bounce, and nested `every N ticks` actions. The proven trio still generates 422 source characters. The new blink timing candidate generates 407 characters and is the next hardware test; its `Engine.T` counter avoids the unsafe IIFE used by `engreset`. A full 12x12 costume painter remains next because raw artwork competes with the 512-byte Game payload ceiling.

## Event, bounce-action, and random-value design

The compiler now models event handlers separately from the continuous update list. Shake compiles to `Engine.WhenShaken`; directional tilt compiles to `Engine.WhenTilted("LEFT"|"RIGHT"|"FORWARD"|"BACK", ...)`. Numeric angles are not claimed because the recovered public Engine has no raw accelerometer or pitch/roll getter.

A nested bounce event combines collision detection, axis-correct velocity reversal, and child actions. Random colour, velocity, and position use the recovered inclusive `Engine.mathRandomInt`. The focused random-bounce example is 429 source characters; the combined sensor-registration regression is 403. These pass offline generation tests but require hardware confirmation.

Naive multipart Game writes remain unsupported: firmware evidence shows one complete protobuf is decoded per Game-characteristic write and no application-level append/reassembly fields have been found.
