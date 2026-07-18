# How The Stock App Path Works

The Arcade Coder is an ESP32 device with a 12x12 RGB LED matrix. The useful BLE path is a stock service with command and callback characteristics.

## BLE characteristics

- Service: `778d5426-fa29-4363-91fd-a9f5cfcfce85`
- Command: `e18d056b-7dae-49c1-b5f2-17684801e446`
- Callback: `21acb4a0-24d0-42f4-8e61-c827daf68d12`
- Game upload: `27f450db-9197-4e02-85fd-9cba87639a28`

## Onboard modules

Known module names:

- `paint` - useful control mode. It accepts compact canvas updates and updates the matrix.
- `testmode` - onboard colour-cycle/demo mode.
- `initial-interaction` - stock first-run style interaction.
- `matrix` - appears to be a support module and may error if started directly.

## Paint mode

The current reliable workflow is:

1. Connect over BLE.
2. Start built-in module `paint`.
3. Send compact canvas payloads as command type 4.

A compact canvas is:

```text
byte 0: width
byte 1: height
bytes 2..n: raw DEFLATE stream containing width * height * 3 bytes
```

For the full matrix that means 12 x 12 x 3 = 432 inflated bytes.

## Colour order

The UI exposes normal display colours, but the hardware path swaps red and blue. The uploaded `engbounce2` source used `[255, 0, 0]` and the physical light appeared blue, confirming the mismatch for native costumes as well as the paint path. Treat the device-facing order as BGR relative to ordinary RGB; the app handles this for generated images and pixel-grid output.

## Native custom app upload

Custom JavaScript upload is now proven on unmodified stock firmware:

1. Put the runtime name in `Game.field2`.
2. Put ordinary embedded-XS-compatible JavaScript in `Game.field3`.
3. Upload the complete protobuf to the Game characteristic in one write (keep the payload below the observed ~512-byte Windows/Bleak ceiling).
4. Start command type 0 with the name payload and a nonzero update frequency in outer field 3 / nested field 1 as an IEEE-754 fixed32.

The known-good reference is `app_upload_v2/test_packages/06_engine_move_once.js`, encoded as `hardware_test/engmove.bin`. Hardware logged the save and an 8 Hz start; the uploaded game displayed a red LED moving horizontally across the matrix and then offscreen.

Use `app_upload_v2/send_game_upload.py` with UART attached. See `APP_UPLOAD_AGENT_HANDOFF.md` for the exact protocol, recovered Engine API, failed-test ledger, and reverse-engineering evidence.
## Bleak notes

On Windows, BLE writes can fail if another process is holding the device or if the MTU/write mode does not match what Windows accepts. The UI and scripts use short writes with `response=False` for the paint path.
## What native execution does and does not prove

The `engmove` result proves the upload, compile, schedule, render, and native-update chain. The larger goal is general programming: physical input events, live BLE control and callbacks, a stable project runtime, and Scratch-style code generation. Track that work in [NATIVE_PROGRAMMING_ROADMAP.md](NATIVE_PROGRAMMING_ROADMAP.md).

`engbounce` rendered and began ticking, but its first uploaded update callback failed with `TypeError: ?: cannot coerce to instance`. Direct access through a Sprite captured by the loader's extracted top-level `var` context is therefore not safe. The follow-up batch (`engbounce2`, `enghelper`, `engreset`, and callback-free `engmulti`) separates live collection access, helper access, plain JavaScript callback state, and native multi-Sprite animation.

Accelerometer testing is parked. `engshake` started without a VM error and produced `Right!`/`Left!` wrapper logs, but no `Shake!`. Because the device is currently unscrewed and exposed on a desk, it cannot safely be shaken hard; that result is inconclusive rather than an API failure.
### Hardware-proven looping animation

`engbounce2` is the canonical continuous-animation result. It starts at 8 Hz, obtains the live Sprite through `Engine.spriteClasses[0][0]`, reads `x`, and changes `speedX` at the two boundaries. On hardware the light travelled back and forth continuously without a Tick error. This proves that ordinary uploaded JavaScript callbacks and direct live-Sprite state work when the code remains in the loader's normal source body rather than being extracted as top-level `var` context.

`engmulti` is also hardware-proven: three callback-free Sprites with different positions, velocities, and source colours animated successfully. `enghelper` displayed a green light continuously moving side to side, proving that `Engine.GetX` and `Engine.SetSpeed` work when passed the live Sprite class from `Engine.spriteClasses[0]` in the normal source body.
The next complex regression candidate is `trio`, which places three Sprites in one live class and uses one shared update callback to bounce horizontal, vertical, and diagonal motion. It remains below the single-write ceiling at 437 bytes. See `NATIVE_PROGRAMMING_ROADMAP.md` for the command and the post-test implementation sequence.

Do not rerun `engreset`. Its IIFE/callback construction caused a stack overflow in the Game VM task and rebooted the ESP32 immediately after the start log. The exact VM/compiler failure is not yet isolated, but IIFE-style state wrappers should be excluded from generated code.

Firmware command type 3 (`post`) sends a UTF-8 string to a `post(payload)` method on the active VM object. Built-in modules parse that payload with `JSON.parse`. The equivalent source-level binding for generic uploaded games is not yet recovered, so BLE live control is a confirmed firmware capability but not yet a proven custom-game API.
## Built-in application decompilation

All eleven embedded XS archives and their 60 named JavaScript bodies have now been decoded with the firmware-matched historical opcode table. See `stock_reverse/BUILTIN_XS_DECOMPILATION.md` and `stock_reverse/ghidra_reports/xs_modules/`.

The generic uploaded-game wrapper forwards button, tilt, and shake events into the injected Engine and redraws immediately. Its UART strings are authoritative: an actual shake logs `Shake!`; `Right!` and `Left!` are tilt events.

Its command-type-3 handler parses the supplied string as JSON and only acts when the decoded value equals `home-button-press`, toggling the game's paused state. Arbitrary live messages are not exposed to uploaded source by this stock wrapper.
## Scratch-style compiler

The first Arcade Blocks vertical slice is implemented at `/scratch.html`. Blockly is loaded as pinned browser JavaScript from a CDN; no package manager or build step is required. Custom blocks compile into the proven normal-body/live-Sprite JavaScript pattern, then the Python server validates, builds, uploads, and starts the native Game.

The initial block set creates up to four moving lights and applies shared edge-bounce behavior. It enforces the 512-byte limit, red/blue costume conversion, no top-level `var`, no IIFEs, safe runtime names, and explicit UART acknowledgement. See [SCRATCH_SETUP.md](SCRATCH_SETUP.md).


## Paint-frame size and bottom-row corruption observation

The user reports that busy, many-colour paint animations sometimes garble pixels in the final one or two matrix rows. This is not yet attributed to one cause.

Every full frame inflates to exactly 432 bytes, but raw-DEFLATE size varies greatly with image entropy. Measurements through the actual encoder:

| Frame | Compact canvas | Complete command |
|---|---:|---:|
| black | 10 B | 18 B |
| solid colour | 12 B | 20 B |
| smooth gradient | 301 B | 311 B |
| deterministic random RGB | 439 B | 449 B |

This makes complex colour frames a useful transport-boundary probe even though they remain below 512 bytes. Missing/corrupt bottom rows are compatible with late-stream truncation or incomplete inflation, but two other live hypotheses must be separated:

- the browser animation loop uses an async send inside `setInterval`, allowing requests to overlap/backlog;
- firmware has emitted `Animation: Couldn't take matrix mutex`, so rapid paint/show operations may contend with redraw.

Focused test:

1. generate one fixed high-entropy 12x12 frame whose command is about 449 bytes;
2. send that identical frame manually or at 1 fps;
3. record exact `canvasBytes`, command bytes, visible bottom rows, and UART;
4. repeat at 2, 4, 8, then 12 fps;
5. compare with a visually full but solid 20-byte command.

Corruption at 1 fps only for the large frame points toward write/decode size. Clean 1 fps but corruption as rate rises points toward request backlog or matrix locking. The next animation-runner hardening should replace overlapping `setInterval` sends with a single-flight loop that schedules the next frame only after the prior BLE write completes.


### Refined plasma evidence

The user confirmed bottom-row corruption at 1 fps with no UART error, using the `claude plasma` animation. This rules out high send rate as the primary cause, though single-flight pacing is still desirable.

Measured raw-DEFLATE canvas sizes for successive plasma frames rise through a particularly informative boundary: frame 0 about 141 B, frame 12 about 241 B, frame 14 about 250 B, frame 15 about 256 B, and later frames roughly 260-268 B. This makes a Paint-specific 255/256-byte protobuf field, decoder scratch buffer, or parseBuffer boundary the leading hypothesis. It is separate from the Game characteristic, where a 437-byte game was hardware-proven.

Focused confirmation requires no animation playback:

1. stop playback;
2. select `claude plasma`;
3. enter frame 12 and send once;
4. enter frame 14 and send once;
5. enter frame 15 and send once;
6. enter frame 20 and send once;
7. record which first frame corrupts and the displayed `compact bytes`.

If the transition is at compact canvas size 256, implement adaptive colour quantization/palette reduction so each paint canvas remains below a conservative 250-byte ceiling, then repeat. This should preserve all 12 rows at the cost of slightly reduced colour precision. Do not apply the 250-byte limit to Game uploads; it is a Paint-path hypothesis.

### Early plasma frames refute the 256-byte hypothesis

Further physical observations supersede the proposed frame-15 threshold: plasma frame 1 renders correctly, frame 2 corrupts the final pixel and loses the bottom row, frame 3 fills the bottom row with incorrect colours, and frame 4 is worse. These early compact canvases are only roughly 141-173 bytes. Therefore neither high FPS nor a 255/256-byte paint payload boundary explains the fault.

The corruption grows from the tail of the 432-byte inflated matrix buffer, while UART remains silent. The leading hypothesis is now compatibility between Python zlib's valid dynamic-Huffman raw-DEFLATE stream and the stock firmware's older `parseBuffer` inflater, including end-of-stream/tail-copy handling.

The Animations page now offers selectable encodings for the same pixels: Dynamic, Fixed Huffman, Huffman only, RLE, and Stored/uncompressed. The server reports compact-canvas and complete-command byte counts. Test one known-bad plasma frame manually with Dynamic and Fixed Huffman first. Identical pixels with Dynamic corrupt and Fixed correct would justify making Fixed the default. If both corrupt identically, compare Stored; if Stored works, the issue remains in compressed-block decoding. If Stored also corrupts, return focus to protobuf/BLE buffer handling or matrix copy length.
### Paint corruption root cause isolated and safe default changed

Hardware comparison established:

- zlib default/dynamic: corrupt
- fixed Huffman with normal zlib matching: corrupt
- Huffman-only: correct
- RLE: correct
- stored/uncompressed: correct

This refutes a Huffman-table bug. Dynamic and fixed differ in Huffman representation but both use normal LZ77 length/distance backreferences. Huffman-only emits coded literals without general match references; stored has no compression references; RLE restricts matching to run-length/distance-one cases. The best-supported conclusion is that the stock `parseBuffer` inflater mishandles some general LZ77 backreference copies, producing progressively corrupt tail bytes without logging an error.

`compact_canvas_from_rgb` now defaults to Huffman-only for all server-generated Paint canvases. It is safer than RLE because it avoids match-distance copying entirely, and considerably smaller than always using stored blocks. The Animations selector retains every mode for diagnostics, labels Dynamic as incompatible, and selects Huffman-only by default. `tests/test_paint_compression.py` verifies round-trip decoding for all modes and locks the safe default.
### AI Animation compression path

`ai_animation` sends RGB frames through its `/api/board/send-frame` proxy to the board server's `/api/send-rgb-buffer`. It now explicitly requests `compression: "huffman"`. The proxy also injects that default server-side when a cached/older frontend omits it, so AI-generated animations use the firmware-safe literal-only DEFLATE path.