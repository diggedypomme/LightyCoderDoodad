#!/usr/bin/env python3
"""Local web UI/backend for stock Arcade Coder paint control."""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import mimetypes
import os
import re
import subprocess
import ctypes
import sys
import threading
import time
import zlib
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from bleak import BleakClient, BleakScanner  # noqa: E402
from stock_protocol.arcade_coder import (  # noqa: E402
    CALLBACK_CHAR,
    COMMAND_CHAR,
    CommandMessage,
    ProtobufEncoder,
    WIRE_LEN,
    WIRE_VARINT,
)


CONFIG_PATH = REPO / "device_config.json"
FALLBACK_ADDRESS = "C4:4F:33:24:15:37"


def load_device_config() -> dict[str, object]:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_device_config(address: str) -> None:
    CONFIG_PATH.write_text(json.dumps({"address": address}, indent=2) + "\n", encoding="utf-8")


def default_address() -> str:
    return str(os.environ.get("LIGHTY_CODER_ADDRESS") or load_device_config().get("address") or FALLBACK_ADDRESS)


DEFAULT_ADDRESS = default_address()
OBS_PATH = ROOT / "observations.jsonl"

CANVASES: dict[str, str] = {
    "br": "0c0c6318050c4306b08adc0100",
    "br_line_10": "0c0c6315b903470c380050010e198430316a10aa47590c240056913b10c42a720700",
    "br_line_11": "0c0c6315b903470c380050010e198430b5d4204c1c65314001abc81d086215b90300",
    "br_line_12": "0c0c6315b903470c380050010e1984303dd5206c1d192c56913b10c42a720700",
    "bl_bright_red": "0c0c6318050c8305b08adcc1ef1406060600",
}

AURORA_STATUS_URLS = [
    "https://aurorawatch-api.lancs.ac.uk/0.2/status/current-status.xml",
    "http://aurorawatch-api.lancs.ac.uk/0.2/status/current-status.xml",
    "https://aurorawatch-api.lancs.ac.uk/0.2/current-status.xml",
    "http://aurorawatch-api.lancs.ac.uk/0.2/current-status.xml",
]

CPU_SAMPLE: tuple[int, int, int] | None = None
NET_SAMPLE: tuple[float, int, int] | None = None
NETWORK_BASE_MBPS = 500.0


KNOWN_PIXELS: dict[str, dict[str, object]] = {
    "0,11": {
        "label": "bottom left bright red",
        "hex": "0c0c6318050c8305b08adcc1ef1406060600",
        "confidence": "reported by user 2026-06-23",
    },
    "11,11": {
        "label": "bottom right",
        "hex": "0c0c6318050c4306b08adc0100",
        "confidence": "confirmed",
    },
    "10,11": {
        "label": "bottom row x10",
        "hex": "0c0c6318050c4303b08adc6160600000",
        "confidence": "confirmed single fresh capture",
    },
    "0,0": {
        "label": "top left",
        "hex": "0c0c6315b9c3300a1886066060600000",
        "confidence": "confirmed single fresh capture",
    },
    "1,0": {
        "label": "top row x1",
        "hex": "0c0c6360606015b903244711c3a0070c0c0c00",
        "confidence": "confirmed single fresh capture",
    },
    "0,1": {
        "label": "left column y1",
        "hex": "0c0c632002b08adc2142d5a812065a0306060600",
        "confidence": "confirmed but coordinate map still worth rechecking",
    },
    "11,0": {
        "label": "top right",
        "hex": "0c0c6320045845ee1052322acf401fc0c0c00000",
        "confidence": "confirmed duplicate deterministic capture",
    },
}


def spaced_hex(data: bytes) -> str:
    return " ".join(f"{byte:02x}" for byte in data)

def decimal_bytes(data: bytes) -> str:
    return " ".join(str(byte) for byte in data)



def deflate_raw(data: bytes, level: int = 9) -> bytes:
    compressor = zlib.compressobj(level=level, wbits=-15)
    return compressor.compress(data) + compressor.flush()


def inflate_raw(data: bytes) -> bytes:
    """Decompress raw DEFLATE data (no zlib header)."""
    decompressor = zlib.decompressobj(wbits=-15)
    return decompressor.decompress(data) + decompressor.flush()


def decode_varint(data: bytes, pos: int) -> tuple[int, int]:
    """Decode a varint at position pos, return (value, new_position)."""
    value = 0
    shift = 0
    while pos < len(data):
        byte = data[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return value, pos
        shift += 7
    raise ValueError("Truncated varint")


def decode_field_header(data: bytes, pos: int) -> tuple[int, int, int]:
    """Decode field header, return (field_num, wire_type, new_position)."""
    key, pos = decode_varint(data, pos)
    field_num = key >> 3
    wire_type = key & 0x07
    return field_num, wire_type, pos


def extract_canvas_from_protobuf(data: bytes) -> bytes | None:
    """Extract compact canvas from protobuf notification structure."""
    try:
        # Notifications structure: field 1 (VARINT), field 3 (LEN) containing field 1 (LEN) with canvas
        pos = 0
        while pos < len(data):
            field_num, wire_type, pos = decode_field_header(data, pos)
            if wire_type == WIRE_LEN:
                length, pos = decode_varint(data, pos)
                if field_num == 3:  # Response payload field
                    # This contains the canvas, extract field 1 from it
                    payload = data[pos:pos + length]
                    inner_pos = 0
                    while inner_pos < len(payload):
                        inner_field, inner_wire, inner_pos = decode_field_header(payload, inner_pos)
                        if inner_wire == WIRE_LEN:
                            inner_length, inner_pos = decode_varint(payload, inner_pos)
                            if inner_field == 1:  # Canvas data field
                                return payload[inner_pos:inner_pos + inner_length]
                            inner_pos += inner_length
                        elif inner_wire == WIRE_VARINT:
                            _, inner_pos = decode_varint(payload, inner_pos)
                pos += length
            elif wire_type == WIRE_VARINT:
                _, pos = decode_varint(data, pos)
        return None
    except Exception:
        return None


def decode_compact_canvas(canvas_hex: str) -> dict[str, object] | None:
    """Decode a compact canvas notification into pixel data."""
    try:
        data = bytes.fromhex(canvas_hex.replace(" ", ""))

        # Try to extract canvas from protobuf wrapper first
        canvas = extract_canvas_from_protobuf(data)
        if not canvas:
            # Fallback: assume it's raw compact canvas
            canvas = data

        if len(canvas) < 2:
            return None
        width = canvas[0]
        height = canvas[1]
        if not (1 <= width <= 12 and 1 <= height <= 12):
            return None
        compressed = canvas[2:]
        rgb_data = inflate_raw(compressed)
        expected_size = width * height * 3
        if len(rgb_data) != expected_size:
            return None
        # Convert to list of [r, g, b] pixels
        pixels = []
        for i in range(0, len(rgb_data), 3):
            pixels.append([rgb_data[i], rgb_data[i + 1], rgb_data[i + 2]])
        return {
            "width": width,
            "height": height,
            "pixels": pixels,
        }
    except Exception:
        return None


def compact_canvas_from_rgb(width: int, height: int, rgb: bytes) -> bytes:
    expected = width * height * 3
    if not (1 <= width <= 12 and 1 <= height <= 12):
        raise ValueError("width/height must be 1..12")
    if len(rgb) != expected:
        raise ValueError(f"expected {expected} RGB bytes, got {len(rgb)}")
    return bytes([width, height]) + deflate_raw(rgb)


def single_pixel_canvas(x: int, y: int, r: int, g: int, b: int) -> bytes:
    if not (0 <= x < 12 and 0 <= y < 12):
        raise ValueError("x/y must be 0..11")
    rgb = bytearray(12 * 12 * 3)
    offset = (y * 12 + x) * 3
    rgb[offset : offset + 3] = bytes([r & 0xff, g & 0xff, b & 0xff])
    return compact_canvas_from_rgb(12, 12, bytes(rgb))



def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def fetch_aurora_status() -> dict[str, object]:
    errors: list[str] = []
    for url in AURORA_STATUS_URLS:
        try:
            req = Request(url, headers={"User-Agent": "codex-arcade-coder-paint-ui/0.1"})
            with urlopen(req, timeout=10) as response:
                xml_bytes = response.read()
            root = ElementTree.fromstring(xml_bytes)
            statuses: list[dict[str, object]] = []
            for element in root.iter():
                if _local_name(element.tag) != "site_status":
                    continue
                status_id = element.attrib.get("status_id", "").lower()
                if not status_id:
                    continue
                item: dict[str, object] = {
                    "statusId": status_id,
                    "projectId": element.attrib.get("project_id", ""),
                    "siteId": element.attrib.get("site_id", ""),
                    "siteUrl": element.attrib.get("site_url", ""),
                    "isAlerting": any("alert" in key.lower() and value.lower() in {"1", "true", "yes"} for key, value in element.attrib.items()),
                }
                statuses.append(item)
            if not statuses:
                raise ValueError("no site_status entries in XML")
            rank = {"green": 0, "yellow": 1, "amber": 2, "red": 3}
            alerting = [row for row in statuses if row.get("isAlerting")]
            chosen = alerting[0] if alerting else max(statuses, key=lambda row: rank.get(str(row["statusId"]), -1))
            return {"ok": True, "url": url, "chosen": chosen, "statuses": statuses[:50]}
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return {"ok": False, "error": "; ".join(errors)}


class FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.c_uint32), ("dwHighDateTime", ctypes.c_uint32)]


def _filetime_to_int(value: FILETIME) -> int:
    return (value.dwHighDateTime << 32) | value.dwLowDateTime


def _read_cpu_times() -> tuple[int, int, int]:
    idle = FILETIME()
    kernel = FILETIME()
    user = FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
        raise OSError("GetSystemTimes failed")
    return (_filetime_to_int(idle), _filetime_to_int(kernel), _filetime_to_int(user))


class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]



def _read_network_totals() -> tuple[int, int]:
    proc = subprocess.run(["netstat", "-e"], capture_output=True, text=True, timeout=8, check=True)
    for line in proc.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0].lower() == "bytes":
            return (int(parts[1]), int(parts[2]))
    raise ValueError("could not parse netstat -e byte counters")


def _network_rates() -> dict[str, object]:
    global NET_SAMPLE
    now = time.time()
    rx, tx = _read_network_totals()
    result: dict[str, object] = {
        "networkRxBytes": rx,
        "networkTxBytes": tx,
        "networkBaseMbps": NETWORK_BASE_MBPS,
        "networkRxMbps": None,
        "networkTxMbps": None,
        "networkTotalMbps": None,
        "networkPercent": None,
    }
    if NET_SAMPLE is not None:
        old_time, old_rx, old_tx = NET_SAMPLE
        elapsed = max(0.001, now - old_time)
        rx_mbps = max(0.0, (rx - old_rx) * 8.0 / elapsed / 1_000_000.0)
        tx_mbps = max(0.0, (tx - old_tx) * 8.0 / elapsed / 1_000_000.0)
        total_mbps = rx_mbps + tx_mbps
        result.update({
            "networkRxMbps": rx_mbps,
            "networkTxMbps": tx_mbps,
            "networkTotalMbps": total_mbps,
            "networkPercent": max(0.0, min(100.0, total_mbps / NETWORK_BASE_MBPS * 100.0)),
        })
    NET_SAMPLE = (now, rx, tx)
    return result


def _gpu_stats() -> dict[str, object]:
    result: dict[str, object] = {
        "gpuPercent": None,
        "vramPercent": None,
        "vramUsedMb": None,
        "vramTotalMb": None,
        "gpuSource": "none",
    }
    try:
        proc = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.total,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=8,
            check=True,
        )
        used_total = 0.0
        total_total = 0.0
        gpu_values: list[float] = []
        for line in proc.stdout.splitlines():
            parts = [part.strip() for part in line.split(",")]
            if len(parts) < 3:
                continue
            used = float(parts[0])
            total = float(parts[1])
            util = float(parts[2])
            used_total += used
            total_total += total
            gpu_values.append(util)
        if total_total > 0:
            result.update({
                "gpuPercent": max(gpu_values) if gpu_values else None,
                "vramPercent": max(0.0, min(100.0, used_total / total_total * 100.0)),
                "vramUsedMb": used_total,
                "vramTotalMb": total_total,
                "gpuSource": "nvidia-smi",
            })
            return result
    except Exception:
        pass

    try:
        script = "$gpu=(Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object -Property CookedValue -Sum; $mem=(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object -Property CookedValue -Sum; @{gpu=[double]$gpu.Sum; vramBytes=[double]$mem.Sum} | ConvertTo-Json -Compress"
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, timeout=10, check=True)
        data = json.loads(proc.stdout)
        result.update({
            "gpuPercent": max(0.0, min(100.0, float(data.get("gpu") or 0.0))),
            "vramUsedMb": float(data.get("vramBytes") or 0.0) / 1024.0 / 1024.0,
            "gpuSource": "windows-counters",
        })
    except Exception:
        pass
    return result


def read_system_stats() -> dict[str, object]:
    global CPU_SAMPLE
    cpu_now = _read_cpu_times()
    cpu_percent: float | None = None
    if CPU_SAMPLE is not None:
        idle_delta = cpu_now[0] - CPU_SAMPLE[0]
        kernel_delta = cpu_now[1] - CPU_SAMPLE[1]
        user_delta = cpu_now[2] - CPU_SAMPLE[2]
        total_delta = kernel_delta + user_delta
        if total_delta > 0:
            cpu_percent = max(0.0, min(100.0, 100.0 * (1.0 - idle_delta / total_delta)))
    CPU_SAMPLE = cpu_now

    mem = MEMORYSTATUSEX()
    mem.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
        raise OSError("GlobalMemoryStatusEx failed")
    network = _network_rates()
    gpu = _gpu_stats()
    return {
        "ok": True,
        "cpuPercent": cpu_percent,
        "memoryPercent": float(mem.dwMemoryLoad),
        "memoryUsedBytes": int(mem.ullTotalPhys - mem.ullAvailPhys),
        "memoryTotalBytes": int(mem.ullTotalPhys),
        **network,
        **gpu,
    }


async def scan_ble_devices(timeout: float = 6.0) -> list[dict[str, object]]:
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    rows: list[dict[str, object]] = []
    for address, pair in devices.items():
        device, adv = pair
        name = device.name or adv.local_name or ""
        service_uuids = [uuid.lower() for uuid in (adv.service_uuids or [])]
        likely_arcade = "arcade" in name.lower() or "coder" in name.lower() or "778d5426-fa29-4363-91fd-a9f5cfcfce85" in service_uuids
        rows.append({
            "address": address,
            "name": name,
            "rssi": getattr(device, "rssi", None),
            "serviceUuids": service_uuids,
            "likelyArcadeCoder": likely_arcade,
        })
    rows.sort(key=lambda row: (not row["likelyArcadeCoder"], -(row["rssi"] or -999)))
    return rows


def compact_canvas_command(canvas: bytes) -> bytes:
    enc = ProtobufEncoder()
    payload = enc.encode_field(1, WIRE_VARINT, 0)
    payload += enc.encode_field(2, WIRE_LEN, canvas)
    command = enc.encode_field(1, WIRE_VARINT, 4)
    command += enc.encode_field(7, WIRE_LEN, payload)
    return command


class BleSession:
    def __init__(self, address: str) -> None:
        self.address = address
        self.client: BleakClient | None = None
        self.started_paint = False
        self.last_notify: str | None = None
        self.log: list[str] = []

    def add_log(self, message: str) -> None:
        line = f"[{time.strftime('%H:%M:%S')}] {message}"
        self.log.append(line)
        self.log = self.log[-80:]
        print(line, flush=True)

    def on_notify(self, _sender, data: bytearray) -> None:
        raw = bytes(data)
        self.last_notify = raw.hex()
        self.add_log(f"notify {len(raw)} bytes hex: {spaced_hex(raw)} | dec: {decimal_bytes(raw)}")

    async def ensure_connected(self) -> None:
        # Check if we have a valid connection
        try:
            if self.client and self.client.is_connected:
                return
        except OSError:
            # Windows COM error - connection is stale, force reconnect
            self.add_log("stale connection detected, forcing reconnect")
            self.client = None

        self.add_log(f"connecting to {self.address}")
        self.client = BleakClient(self.address)
        await self.client.connect()
        await self.client.start_notify(CALLBACK_CHAR, self.on_notify)
        self.add_log("connected and subscribed")

    async def write_with_retry(self, characteristic: str, data: bytes, response: bool = False) -> None:
        """Write to GATT characteristic with automatic reconnect on COM errors."""
        assert self.client is not None
        try:
            await self.client.write_gatt_char(characteristic, data, response=response)
        except OSError as exc:
            # Windows COM error - try reconnecting once
            self.add_log(f"write failed ({exc}), reconnecting and retrying")
            self.client = None
            await self.ensure_connected()
            assert self.client is not None
            await self.client.write_gatt_char(characteristic, data, response=response)

    async def disconnect(self) -> None:
        if self.client and self.client.is_connected:
            await self.client.disconnect()
        self.started_paint = False
        self.add_log("disconnected")

    async def start_builtin(self, module_name: str) -> None:
        await self.ensure_connected()
        await self.write_with_retry(COMMAND_CHAR, CommandMessage.start_builtin(module_name), response=False)
        self.started_paint = module_name == "paint"
        self.add_log(f"sent start built-in {module_name}")

    async def start_paint(self) -> None:
        await self.start_builtin("paint")

    async def send_compact_canvas(self, canvas: bytes, start_if_needed: bool = False) -> dict[str, object]:
        await self.ensure_connected()
        if start_if_needed and not self.started_paint:
            await self.start_paint()
            await asyncio.sleep(1.5)
        command = compact_canvas_command(canvas)
        await self.write_with_retry(COMMAND_CHAR, command, response=False)
        self.add_log(f"sent canvas {len(canvas)} bytes hex: {spaced_hex(canvas)} | dec: {decimal_bytes(canvas)}")
        return {"canvasBytes": len(canvas), "canvasHex": canvas.hex(), "commandHex": command.hex()}

    async def send_canvas(self, canvas_hex: str, start_if_needed: bool = False) -> dict[str, object]:
        await self.ensure_connected()
        if start_if_needed and not self.started_paint:
            await self.start_paint()
            await asyncio.sleep(1.5)
        canvas = bytes.fromhex(canvas_hex.replace(" ", ""))
        command = compact_canvas_command(canvas)
        await self.write_with_retry(COMMAND_CHAR, command, response=False)
        self.add_log(f"sent canvas {len(canvas)} bytes hex: {spaced_hex(canvas)} | dec: {decimal_bytes(canvas)}")
        return {"canvasBytes": len(canvas), "commandHex": command.hex()}

    def status(self) -> dict[str, object]:
        decoded = decode_compact_canvas(self.last_notify) if self.last_notify else None
        return {
            "address": self.address,
            "connected": bool(self.client and self.client.is_connected),
            "paintStarted": self.started_paint,
            "lastNotify": self.last_notify,
            "decodedCanvas": decoded,
            "log": self.log,
        }


class AppState:
    def __init__(self, address: str) -> None:
        self.loop = asyncio.new_event_loop()
        self.session = BleSession(address)
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro):
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result(timeout=30)

    def set_address(self, address: str) -> None:
        save_device_config(address)
        if self.session.client and self.session.client.is_connected:
            self.run(self.session.disconnect())
        self.session = BleSession(address)


STATE: AppState | None = None


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    data = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, object]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))



def _markdown_inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', escaped)
    return escaped


def render_markdown_page(markdown: str, title: str) -> str:
    out: list[str] = []
    in_list = False
    in_code = False
    code_lines: list[str] = []

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if line.startswith("```"):
            if in_code:
                out.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")
                code_lines = []
                in_code = False
            else:
                close_list()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not line.strip():
            close_list()
            continue
        heading = re.match(r"^(#{1,4})\s+(.*)$", line)
        if heading:
            close_list()
            level = len(heading.group(1))
            out.append(f"<h{level}>{_markdown_inline(heading.group(2))}</h{level}>")
            continue
        if line.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_markdown_inline(line[2:])}</li>")
            continue
        close_list()
        out.append(f"<p>{_markdown_inline(line)}</p>")
    close_list()
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")

    body = "\n".join(out)
    safe_title = html.escape(title)
    return f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
    <title>{safe_title}</title>
    <link rel=\"stylesheet\" href=\"/styles.css\">
    <style>
      .doc-page {{ max-width: 980px; margin: 0 auto; }}
      .doc-page h1 {{ margin-bottom: 10px; }}
      .doc-page h2, .doc-page h3 {{ margin-top: 22px; margin-bottom: 8px; }}
      .doc-page p, .doc-page li {{ line-height: 1.5; margin: 8px 0; }}
      .doc-page ul {{ padding-left: 22px; }}
      .doc-page code {{ background: #eef1f4; padding: 1px 4px; border-radius: 4px; }}
      .doc-page pre code {{ display: block; padding: 10px; overflow-x: auto; }}
    </style>
  </head>
  <body>
    <main class=\"doc-page\">
      <header>
        <div><h1>{safe_title}</h1><p>Arcade Coder local documentation</p></div>
        <div class=\"toolbar\"><a class=\"button-link\" href=\"/onboard.html\">Onboard Apps</a><a class=\"button-link\" href=\"/\">Main</a></div>
      </header>
      <section class=\"panel\">{body}</section>
    </main>
  </body>
</html>"""
class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            assert STATE is not None
            json_response(self, 200, STATE.session.status())
            return
        if parsed.path == "/api/config":
            json_response(self, 200, {"canvases": CANVASES, "knownPixels": KNOWN_PIXELS})
            return
        if parsed.path == "/api/observations":
            rows = []
            if OBS_PATH.exists():
                rows = [json.loads(line) for line in OBS_PATH.read_text().splitlines() if line.strip()]
            json_response(self, 200, {"observations": rows[-200:]})
            return
        if parsed.path == "/api/aurora-status":
            json_response(self, 200, fetch_aurora_status())
            return
        if parsed.path == "/api/system-stats":
            json_response(self, 200, read_system_stats())
            return
        if parsed.path == "/api/scan-devices":
            assert STATE is not None
            devices = STATE.run(scan_ble_devices(6.0))
            json_response(self, 200, {"ok": True, "devices": devices})
            return

        path = parsed.path
        if path == "/":
            path = "/index.html"
        if path.startswith("/docs/"):
            file_path = (ROOT / "docs" / path.removeprefix("/docs/")).resolve()
            base_path = (ROOT / "docs").resolve()
        else:
            file_path = (ROOT / "static" / path.lstrip("/")).resolve()
            base_path = (ROOT / "static").resolve()
        if not str(file_path).startswith(str(base_path)) or not file_path.exists():
            self.send_error(404)
            return
        if path.startswith("/docs/") and file_path.suffix.lower() == ".md":
            doc_title = file_path.stem.replace("-", " ").replace("_", " ").title()
            content = render_markdown_page(file_path.read_text(encoding="utf-8"), doc_title).encode("utf-8")
            ctype = "text/html; charset=utf-8"
        else:
            content = file_path.read_bytes()
            ctype = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        assert STATE is not None
        try:
            body = read_json(self)
            if self.path == "/api/connect":
                STATE.run(STATE.session.ensure_connected())
                json_response(self, 200, STATE.session.status())
            elif self.path == "/api/select-device":
                address = str(body.get("address", "")).strip()
                if not address:
                    raise ValueError("address is required")
                STATE.set_address(address)
                json_response(self, 200, {"ok": True, "status": STATE.session.status()})
            elif self.path == "/api/disconnect":
                STATE.run(STATE.session.disconnect())
                json_response(self, 200, STATE.session.status())
            elif self.path == "/api/start-paint":
                STATE.run(STATE.session.start_paint())
                json_response(self, 200, STATE.session.status())
            elif self.path == "/api/start-builtin":
                module = str(body.get("module", "paint")).strip()
                if module not in {"paint", "testmode", "initial-interaction", "matrix"}:
                    raise ValueError(f"unsupported built-in module: {module}")
                STATE.run(STATE.session.start_builtin(module))
                json_response(self, 200, {"ok": True, "module": module, "status": STATE.session.status()})
            elif self.path == "/api/send-canvas":
                key_or_hex = str(body.get("canvas", "br"))
                canvas_hex = CANVASES.get(key_or_hex, key_or_hex)
                result = STATE.run(STATE.session.send_canvas(canvas_hex, bool(body.get("startIfNeeded", False))))
                json_response(self, 200, {"ok": True, **result, "status": STATE.session.status()})
            elif self.path == "/api/send-known-pixel":
                key = str(body["key"])
                entry = KNOWN_PIXELS[key]
                result = STATE.run(STATE.session.send_canvas(str(entry["hex"]), bool(body.get("startIfNeeded", False))))
                json_response(self, 200, {"ok": True, "key": key, **result, "status": STATE.session.status()})
            elif self.path == "/api/send-single-pixel":
                x = int(body["x"])
                y = int(body["y"])
                r = int(body.get("r", 5))
                g = int(body.get("g", 20))
                b = int(body.get("b", 220))
                canvas = single_pixel_canvas(x, y, r, g, b)
                result = STATE.run(STATE.session.send_compact_canvas(canvas, bool(body.get("startIfNeeded", False))))
                json_response(self, 200, {"ok": True, "x": x, "y": y, "r": r & 0xff, "g": g & 0xff, "b": b & 0xff, **result, "status": STATE.session.status()})
            elif self.path == "/api/send-rgb-buffer":
                width = int(body.get("width", 12))
                height = int(body.get("height", 12))
                pixels = body.get("pixels", [])
                if not isinstance(pixels, list):
                    raise ValueError("pixels must be a list")
                if len(pixels) != width * height:
                    raise ValueError(f"expected {width * height} pixels, got {len(pixels)}")
                rgb = bytearray()
                for index, pixel in enumerate(pixels):
                    if not isinstance(pixel, list) or len(pixel) != 3:
                        raise ValueError(f"pixel {index} must be [r,g,b]")
                    rgb.extend(max(0, min(255, int(channel))) for channel in pixel)
                canvas = compact_canvas_from_rgb(width, height, bytes(rgb))
                result = STATE.run(STATE.session.send_compact_canvas(canvas, bool(body.get("startIfNeeded", False))))
                json_response(self, 200, {"ok": True, "width": width, "height": height, **result, "status": STATE.session.status()})
            elif self.path == "/api/mutate":
                source = str(body.get("source", "br"))
                canvas_hex = CANVASES.get(source, source)
                payload = bytearray(bytes.fromhex(canvas_hex.replace(" ", "")))
                offset = int(body["offset"])
                value = int(body["value"])
                old = payload[offset]
                payload[offset] = value
                result = STATE.run(STATE.session.send_canvas(payload.hex(), bool(body.get("startIfNeeded", False))))
                json_response(self, 200, {"ok": True, "old": old, "payload": payload.hex(), **result, "status": STATE.session.status()})
            elif self.path == "/api/observe":
                row = {"time": time.time(), **body}
                with OBS_PATH.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(row) + "\n")
                json_response(self, 200, {"ok": True, "observation": row})
            else:
                self.send_error(404)
        except Exception as exc:
            json_response(self, 500, {"ok": False, "error": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[HTTP] {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    global STATE
    parser = argparse.ArgumentParser(description="Run local Arcade Coder paint UI.")
    parser.add_argument("--address", default=DEFAULT_ADDRESS)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    STATE = AppState(args.address)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Paint UI: http://{args.host}:{args.port}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping.")


if __name__ == "__main__":
    main()


