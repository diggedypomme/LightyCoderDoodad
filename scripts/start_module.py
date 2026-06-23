#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio

from bleak import BleakClient

from common import get_address
from stock_protocol import CALLBACK_CHAR, COMMAND_CHAR, CommandMessage

BUILTINS = ("paint", "testmode", "initial-interaction", "matrix")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Start a built-in Arcade Coder module.")
    parser.add_argument("module", choices=BUILTINS)
    parser.add_argument("--address")
    parser.add_argument("--listen", type=float, default=2.0, help="Seconds to keep notifications open after sending")
    args = parser.parse_args()

    address = get_address(args.address)
    print(f"connecting to {address}")
    async with BleakClient(address) as client:
        await client.start_notify(CALLBACK_CHAR, lambda _sender, data: print(f"notify {len(data)} bytes: {bytes(data).hex()}"))
        await client.write_gatt_char(COMMAND_CHAR, CommandMessage.start_builtin(args.module), response=False)
        print(f"started {args.module}")
        await asyncio.sleep(args.listen)


if __name__ == "__main__":
    asyncio.run(main())