from pathlib import Path
import sys

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from app.server import (
    PAINT_COMPRESSION_MODES,
    compact_canvas_command,
    compact_canvas_from_rgb,
    inflate_raw,
)

raw = bytes((index * 73 + 19) % 256 for index in range(12 * 12 * 3))
default_canvas = compact_canvas_from_rgb(12, 12, raw)
huffman_canvas = compact_canvas_from_rgb(12, 12, raw, compression="huffman")
assert default_canvas == huffman_canvas

for mode in PAINT_COMPRESSION_MODES:
    canvas = compact_canvas_from_rgb(12, 12, raw, compression=mode)
    assert canvas[:2] == bytes([12, 12])
    assert inflate_raw(canvas[2:]) == raw
    assert len(compact_canvas_command(canvas)) < 512

print("paint compression modes ok; safe default is huffman-only")
