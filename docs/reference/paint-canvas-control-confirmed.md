# Paint Canvas Control Confirmed

Date: 2026-06-22

Confirmed hardware result: compact canvas payloads captured from stock `paint` callbacks can be sent back to the device and rendered.

## Working Method

Do **not** write the raw callback bytes directly.

Wrap the inner compact payload as a normal BLE `paint` command in frame mode:

```text
Command type 4 / paint
  PaintPayload.field1 = 0
  PaintPayload.field2 = <compact paint payload bytes>
```

This reaches the decompiled `FUN_400de240` frame-mode path:

```text
payload[0] == 0 -> JS paint({ frame: buffer })
```

## Confirmed Payloads

These rendered successfully:

```text
0c0c6318050c4306b08adc0100
0c0c6315b903470c380050010e198430316a10aa47590c240056913b10c42a720700
0c0c6315b903470c380050010e198430b5d4204c1c65314001abc81d086215b90300
```

## Tools

General test tool:

```powershell
venv\Scripts\python.exe codex_test_paint_inputs.py --mode canvas --canvas-hex 0c0c6318050c4306b08adc0100
```

Convenience sender with named captured canvases:

```powershell
venv\Scripts\python.exe codex_send_paint_canvas.py br
venv\Scripts\python.exe codex_send_paint_canvas.py br_line_10
venv\Scripts\python.exe codex_send_paint_canvas.py br_line_11
venv\Scripts\python.exe codex_send_paint_canvas.py br_line_12
```

You can also pass raw inner payload hex as the positional argument:

```powershell
venv\Scripts\python.exe codex_send_paint_canvas.py 0c0c6318050c4306b08adc0100
```

## Meaning

We now have a stock-firmware display-control path without replacing firmware:

```text
Python -> BLE Command type 4 frame-mode -> built-in paint module -> LEDs
```

The remaining problem is generating the compact canvas format directly, instead of capturing examples manually. That likely requires decoding `/paint.xsb` functions around `serializeBuffer` / `parseBuffer`.


## Compact Canvas Format Decoded

Confirmed from `stock_reverse\ghidra_reports\codex_vmbuiltin_400f2480_FUN_400f2480.c` and `codex_vmbuiltin_400f3b1c_FUN_400f3b1c.c`:

```text
byte 0      width
byte 1      height
byte 2..N   raw DEFLATE stream
```

The DEFLATE stream expands to:

```text
width * height * 3 bytes
```

For the 12x12 Arcade Coder matrix this is always expected to be:

```text
12 * 12 * 3 = 432 bytes
```

Example:

```text
0c0c6318050c4306b08adc0100
```

Decodes as:

```text
width=12 height=12 raw=432 bytes
idx=143 x=11 y=11 rgb=(5,20,220)
```

Important consequence: mutating arbitrary compressed bytes can produce invalid/truncated streams. For example:

```text
0c0c6318050c4305b08adc0100
```

only inflates to 431 bytes, not 432. That explains the unstable/weird visible behaviour from some byte mutations.

Tool:

```powershell
venv\Scripts\python.exe codex_decode_compact_canvas.py br
venv\Scripts\python.exe codex_decode_compact_canvas.py 0c0c6318050c4306b08adc0100
```