#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio

from bleak import BleakClient

from common import COLOURS, get_address, single_pixel_canvas
from stock_protocol import CALLBACK_CHAR, COMMAND_CHAR, CommandMessage


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send a generated one-pixel compact canvas.")
    parser.add_argument("x", type=int)
    parser.add_argument("y", type=int)
    parser.add_argument("--colour", "--color", default="red", choices=sorted(COLOURS))
    parser.add_argument("--rgb", nargs=3, type=int, metavar=("R", "G", "B"), help="Override colour with raw wire RGB bytes")
    parser.add_argument("--address")
    parser.add_argument("--start", action="store_true", help="Start paint before sending")
    parser.add_argument("--settle", type=float, default=1.5)
    args = parser.parse_args()

    r, g, b = tuple(args.rgb) if args.rgb else COLOURS[args.colour]
    canvas = single_pixel_canvas(args.x, args.y, r, g, b)
    address = get_address(args.address)
    print(f"connecting to {address}")
    print(f"pixel {args.x},{args.y} wire rgb=({r},{g},{b}) canvas={canvas.hex()}")
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