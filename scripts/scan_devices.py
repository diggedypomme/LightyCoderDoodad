#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio

from bleak import BleakScanner

from common import save_address
from stock_protocol import SERVICE_UUID


async def main() -> None:
    parser = argparse.ArgumentParser(description="Scan for BLE devices and optionally save one as the Arcade Coder target.")
    parser.add_argument("--timeout", type=float, default=6.0)
    parser.add_argument("--save", help="Save this address to device_config.json")
    parser.add_argument("--save-first-likely", action="store_true", help="Save the first device that advertises like an Arcade Coder")
    args = parser.parse_args()

    devices = await BleakScanner.discover(timeout=args.timeout, return_adv=True)
    rows = []
    for address, pair in devices.items():
        device, adv = pair
        name = device.name or adv.local_name or ""
        uuids = [item.lower() for item in (adv.service_uuids or [])]
        likely = SERVICE_UUID in uuids or "arcade" in name.lower() or "coder" in name.lower()
        rows.append((not likely, -(getattr(device, "rssi", None) or -999), likely, address, name, getattr(device, "rssi", None)))
    rows.sort()

    for _sort1, _sort2, likely, address, name, rssi in rows:
        marker = "*" if likely else " "
        print(f"{marker} {address:20} RSSI={str(rssi):>4}  {name or '(unnamed)'}")

    if args.save:
        save_address(args.save)
        print(f"saved {args.save} to device_config.json")
    elif args.save_first_likely:
        for _sort1, _sort2, likely, address, _name, _rssi in rows:
            if likely:
                save_address(address)
                print(f"saved {address} to device_config.json")
                return
        raise SystemExit("no likely Arcade Coder found")


if __name__ == "__main__":
    asyncio.run(main())