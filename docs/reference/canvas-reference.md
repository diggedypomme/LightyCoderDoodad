# Canvas Reference

These are compact canvas payloads captured from stock `paint` mode and confirmed to replay over BLE.

## Names

| Short name | Meaning | Compact canvas hex |
|---|---|---|
| `br` | Bottom-right single pixel, assumed coordinate `(11,11)` | `0c0c6318050c4306b08adc0100` |
| `br_line_10` | Captured multi-pixel canvas from the 12-point run, notify 10 | `0c0c6315b903470c380050010e198430316a10aa47590c240056913b10c42a720700` |
| `br_line_11` | Captured multi-pixel canvas from the 12-point run, notify 11 | `0c0c6315b903470c380050010e198430b5d4204c1c65314001abc81d086215b90300` |
| `br_line_12` | Captured multi-pixel canvas from the 12-point run, notify 12 | `0c0c6315b903470c380050010e1984303dd5206c1d192c56913b10c42a720700` |
| `bl_bright_red` | Bottom-left bright red, reported 2026-06-23 | `0c0c6318050c8305b08adcc1ef1406060600` |

## What "compact canvas hex" means

This is **not** the whole BLE notification and not raw RGB.

It is the inner payload that the stock `paint` app accepts as:

```text
paint({ frame: <compact canvas bytes> })
```

The backend wraps it into a BLE command:

```text
Command type 4 / paint
  PaintPayload.field1 = 0
  PaintPayload.field2 = <compact canvas bytes>
```

Example:

```text
compact canvas hex:
0c0c6318050c4306b08adc0100

wrapped BLE command hex:
08043a110800120d0c0c6318050c4306b08adc0100
```

