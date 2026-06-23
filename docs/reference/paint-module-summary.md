# Paint Module protocol mapping Summary

## Device
- **Hardware**: Tech Will Save Us Arcade Coder (ESP32-D0WD)
- **LED Matrix**: 12x12 RGB LED grid
- **Firmware**: Stock v3.8.1 (company bankrupt, no app available)
- **Runtime**: XS JavaScript VM (Moddable SDK)

## Paint Module Activation

### Starting Paint Module
```python
await client.start_builtin('paint')
```
- Activates interactive paint mode
- Device waits for physical button presses OR BLE commands
- Default brush color: RED

## Key Discoveries

### 1. Physical Button Press Behavior ✅
- **Works**: Bridging button pads lights corresponding LED
- **Response**: Device sends `game_event` notification with full canvas state
- **Color**: Default RED (confirmed from original app videos)
- **Canvas State**: Serialized XS object format, starting with `0c 0c 63` (12×12 marker)

### 2. Remote LED Control via Canvas Playback ✅
**BREAKTHROUGH**: Paint module accepts serialized canvas state over BLE!

**Method**:
```python
# Wrap canvas payload in game_event message
inner_msg = ProtobufEncoder.encode_message({1: canvas_data})
game_event = ProtobufEncoder.encode_message({
    1: 2,  # type = game_event
    3: inner_msg
})
await client.write_gatt_char(COMMAND_CHAR, game_event)
```

**Result**: LEDs light up remotely according to canvas state
- Confirmed working by codex
- Can replay captured button-press events
- Can send arbitrary canvas states

### 3. Brush Color Control via paint_pixel() ✅
**CONFIRMED**: `paint_pixel(pixel_index, r, g, b)` DOES change brush color!

**Test Results**:
```
Baseline:         RED
After GREEN cmd:  RED (lag)
After BLUE cmd:   GREEN (GREEN from previous command appeared!)
After YELLOW cmd: GREEN (stuck)
After WHITE cmd:  GREEN (stuck)
```

**Observations**:
- ✅ Color change works (red → green transition confirmed)
- ⚠️ 1-command lag between send and display
- ⚠️ Stuck after first color change (needs investigation)
- ❌ BLUE never appeared in initial test

**Implications**:
- CAN remotely change brush color
- User could: send color command → press buttons → paint in that color
- Need to investigate sticking behavior

## Canvas State Format

### Structure
```
0c 0c 63 [payload...]
│  │  │
│  │  └─ 0x63 = 99 decimal (12×12 = 144? Matrix marker?)
│  └──── 0x0c = 12 (matrix width)
└─────── 0x0c = 12 (matrix height)
```

### Known Canvas Payloads
**Single Pixels (Fresh Tests)**:
- P1 (11,11): `0c0c6318050c4306b08adc0100` (13 bytes)
- P2 (10,11): `0c0c6318050c4303b08adc6160600000` (16 bytes)
- P3 (0,0): `0c0c6315b9c3300a1886066060600000` (16 bytes)
- P4 (1,0): `0c0c6360606015b903244711c3a0070c0c0c00` (20 bytes)
- P5 (0,1): `0c0c632002b08adc2142d5a812065a0306060600` (20 bytes)
- P6 (11,0): `0c0c6320045845ee1052322acf401fc0c0c00000` (20 bytes)

**Characteristics**:
- Variable length (13-20+ bytes for single pixels)
- NOT simple coordinate encoding
- Serialized XS object representation
- Likely compressed or delta-encoded

### Byte 3 Investigation (Ongoing)
**Hypothesis**: Byte offset 3 controls stream decoding

Mutation tests on bottom-right pixel (`0c0c6318050c4306b08adc0100`):
```
byte[3] = 0x18 (24) → (11,11) red [ORIGINAL - 1 pixel]
byte[3] = 0x17 (23) → "lots of colours/pixels"
byte[3] = 0x16 (22) → (0,0) red, (0,1) light blue [2 pixels, multi-color!]
byte[3] = 0x19 (?) → [pending test]
```

**Conclusion**: Byte 3 is critical control byte
- Changes decoder interpretation of following stream
- Affects: pixel count, positions, colors
- Likely length/mode/format specifier

## BLE Protocol

### Characteristics
- **COMMAND_CHAR**: Send commands (start_builtin, paint_pixel)
- **CALLBACK_CHAR**: Receive notifications (game_event, frame updates)
- **GAME_CHAR**: Upload/send game data (also works for canvas!)

### Message Wrapping
All messages wrapped in protobuf:
```
Outer: { type: 2, field_3: inner_message }
Inner: { field_1: canvas_payload }
```

## Commands

### paint_pixel()
```python
await client.paint_pixel(pixel_index, r, g, b)
```
- **pixel_index**: 0-143 (0=top-left, row-major order)
- **r, g, b**: 0-255 RGB values
- **Effect**: Changes brush color for subsequent physical button presses
- **Note**: 1-command lag observed, sticking issue after first change

## Testing Scripts

### Canvas Playback
- `codex_send_paint_canvas.py` - Send known canvas states
- `codex_mutate_paint_canvas.py` - Mutate canvas bytes for testing
- `test_canvas_state_playback.py` - Test different send methods

### Brush Color
- `test_brush_color_change.py` - Sequential color test (5 colors)
- `test_single_brush_color.py` - One color, multiple button presses
- `test_extended_brush_colors.py` - 10 colors with various strategies

### Analysis
- `decode_fresh_pixels.py` - Analyze isolated button events
- `analyze_canvas_state.py` - Study canvas accumulation patterns
- `decode_button_positions.py` - Attempt position decoding

## Next Steps

### Immediate Tests
1. ✅ Run `test_single_brush_color.py` to test persistence
2. ✅ Run `test_extended_brush_colors.py` to find blue/other colors
3. Continue byte 3 mutation sweep (0x16, 0x17, 0x18, 0x19)

### Investigation Priorities
1. **Color sticking**: Why does brush color stick after first change?
2. **1-command lag**: Why does color appear on next button press?
3. **Byte 3 role**: Complete understanding of encoding control
4. **Full canvas encoding**: map out serialization format
5. **Arbitrary drawing**: Create custom canvas states for remote LED control

### Potential Applications
- Remote LED drawing without button presses
- Custom animations by sending canvas sequences
- Color palette control for interactive painting
- Full remote control of LED matrix via BLE

## Files Reference

### Core Protocol
- `stock_protocol/arcade_coder.py` - Main protocol implementation
- `ArcadeCoderClient` class - High-level BLE interface

### Known Canvas States
Located in:
- `codex_send_paint_canvas.py` - CANVASES dict
- `decode_fresh_pixels.py` - FRESH_PIXELS array
- `test_canvas_state_playback.py` - CANVAS_STATES dict

### MAC Address
Default: `YOUR_DEVICE_ADDRESS`
