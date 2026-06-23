from __future__ import annotations

import json
import os
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "device_config.json"
FALLBACK_ADDRESS = "C4:4F:33:24:15:37"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CANVASES = {
    "br": "0c0c6318050c4306b08adc0100",
    "br_line_10": "0c0c6315b903470c380050010e198430316a10aa47590c240056913b10c42a720700",
    "br_line_11": "0c0c6315b903470c380050010e198430b5d4204c1c65314001abc81d086215b90300",
    "br_line_12": "0c0c6315b903470c380050010e1984303dd5206c1d192c56913b10c42a720700",
    "bl_bright_red": "0c0c6318050c8305b08adcc1ef1406060600",
}

COLOURS = {
    "off": (0, 0, 0),
    "red": (0, 0, 255),
    "green": (0, 255, 0),
    "blue": (255, 0, 0),
    "white": (255, 255, 255),
    "yellow": (0, 255, 255),
    "cyan": (255, 255, 0),
    "magenta": (255, 0, 255),
}


def load_config() -> dict[str, object]:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_address(address: str) -> None:
    CONFIG_PATH.write_text(json.dumps({"address": address}, indent=2) + "\n", encoding="utf-8")


def get_address(cli_address: str | None = None) -> str:
    return str(cli_address or os.environ.get("LIGHTY_CODER_ADDRESS") or load_config().get("address") or FALLBACK_ADDRESS)


def deflate_raw(data: bytes, level: int = 9) -> bytes:
    compressor = zlib.compressobj(level=level, wbits=-15)
    return compressor.compress(data) + compressor.flush()


def compact_canvas_from_rgb(width: int, height: int, rgb: bytes) -> bytes:
    if len(rgb) != width * height * 3:
        raise ValueError(f"expected {width * height * 3} RGB bytes, got {len(rgb)}")
    return bytes([width, height]) + deflate_raw(rgb)


def single_pixel_canvas(x: int, y: int, r: int, g: int, b: int) -> bytes:
    if not (0 <= x < 12 and 0 <= y < 12):
        raise ValueError("x and y must be 0..11")
    rgb = bytearray(12 * 12 * 3)
    offset = (y * 12 + x) * 3
    rgb[offset:offset + 3] = bytes([r & 0xff, g & 0xff, b & 0xff])
    return compact_canvas_from_rgb(12, 12, bytes(rgb))


def canvas_from_name_or_hex(value: str) -> bytes:
    canvas_hex = CANVASES.get(value, value)
    return bytes.fromhex(canvas_hex.replace(" ", ""))