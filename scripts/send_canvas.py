#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio

from bleak import BleakClient

from common import canvas_from_name_or_hex, get_address
from stock_protocol import CALLBACK_CHAR, COMMAND_CHAR, CommandMessage


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send a compact canvas payload to paint mode.")
    parser.add_argument("canvas", nargs="?", default="br", help="Known name or compact canvas hex")
    parser.add_argument("--address")
    parser.add_argument("--start", action="store_true", help="Start paint before sending")
    parser.add_argument("--settle", type=float, default=1.5)
    args = parser.parse_args()

    address = get_address(args.address)
    canvas = canvas_from_name_or_hex(args.canvas)
    print(f"connecting to {address}")
    print(f"canvas {len(canvas)} bytes: {canvas.hex()}")
    async with BleakClient(address) as client:
        await client.start_notify(CALLBACK_CHAR, lambda _sender, data: print(f"notify {len(data)} bytes: {bytes(data).hex()}"))
        if args.start:
            await client.write_gatt_char(COMMAND_CHAR, CommandMessage.start_builtin("paint"), response=False)
            await asyncio.sleep(args.settle)
        await client.write_gatt_char(COMMAND_CHAR, CommandMessage.compact_canvas(canvas), response=False)
        await asyncio.sleep(args.settle)
        print("sent")


if __name__ == "__main__":
    asyncio.run(main())