#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import time

from bleak import BleakClient, BleakScanner

from common import get_address
from stock_protocol import CALLBACK_CHAR, COMMAND_CHAR, SERVICE_UUID, CommandMessage


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


async def find_device(address: str, timeout: float):
    wanted = address.upper()
    log(f"scanning for {address} for {timeout:.0f}s")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    candidates = []
    for found_address, pair in devices.items():
        device, adv = pair
        name = device.name or adv.local_name or ""
        uuids = [item.lower() for item in (adv.service_uuids or [])]
        likely = SERVICE_UUID in uuids or "arcade" in name.lower() or "coder" in name.lower()
        rssi = getattr(device, "rssi", None)
        marker = "*" if found_address.upper() == wanted else " "
        arcade = " arcade?" if likely else ""
        log(f"{marker} {found_address:20} RSSI={str(rssi):>4} {name or '(unnamed)'}{arcade}")
        candidates.append((found_address.upper(), device))
    for found_address, device in candidates:
        if found_address == wanted:
            return device
    return None


def on_notify(_sender, data: bytearray) -> None:
    log(f"notify {len(data)} bytes: {bytes(data).hex()}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone BLE scan/connect diagnostic for Arcade Coder on Linux/Pi.")
    parser.add_argument("--address", default=None, help="BLE address. Defaults to LIGHTY_CODER_ADDRESS/device_config.json/fallback.")
    parser.add_argument("--scan-timeout", type=float, default=8.0)
    parser.add_argument("--connect-timeout", type=float, default=30.0)
    parser.add_argument("--address-only", action="store_true", help="Skip scan object reuse and connect by address string only.")
    parser.add_argument("--list-services", action="store_true", help="Print discovered GATT services/characteristics after connect.")
    parser.add_argument("--start-paint", action="store_true", help="Subscribe to callback notifications and send the stock paint start command.")
    args = parser.parse_args()

    address = get_address(args.address)
    target = address
    if not args.address_only:
        device = await find_device(address, args.scan_timeout)
        if device is None:
            raise SystemExit(f"did not see {address} during scan")
        target = device
        log("using scanned BLEDevice object for connect")
    else:
        log("connecting by address string only")

    client = BleakClient(target)
    try:
        log(f"connecting with timeout {args.connect_timeout:.0f}s")
        await asyncio.wait_for(client.connect(), timeout=args.connect_timeout)
        log(f"connected: {client.is_connected}")

        if args.list_services:
            for service in client.services:
                log(f"service {service.uuid}")
                for char in service.characteristics:
                    props = ",".join(char.properties)
                    log(f"  char {char.uuid} [{props}]")

        if args.start_paint:
            log("subscribing to callback characteristic")
            await client.start_notify(CALLBACK_CHAR, on_notify)
            await asyncio.sleep(1.0)
            log("writing start paint command")
            await client.write_gatt_char(COMMAND_CHAR, CommandMessage.start_builtin("paint"), response=False)
            await asyncio.sleep(3.0)
    finally:
        if client.is_connected:
            log("disconnecting")
            await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
