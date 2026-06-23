#!/usr/bin/env python3
"""Launch the paint UI with UART messages mirrored into the web log."""

from __future__ import annotations

import argparse
import threading
from http.server import ThreadingHTTPServer

import server as base


class UARTMonitor:
    def __init__(self, port: str | None, baud: int, log_func) -> None:
        self.port = port
        self.baud = baud
        self.log_func = log_func
        self.running = False
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        if not self.port:
            self.log_func("uart disabled")
            return
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self) -> None:
        try:
            import serial

            with serial.Serial(self.port, self.baud, timeout=0.1) as ser:
                self.log_func(f"uart opened {self.port} @ {self.baud}")
                buf = bytearray()
                while self.running:
                    chunk = ser.read(256)
                    if not chunk:
                        continue
                    buf.extend(chunk)
                    while b"\n" in buf or b"\r" in buf:
                        positions = [p for p in (buf.find(b"\n"), buf.find(b"\r")) if p >= 0]
                        idx = min(positions)
                        line = bytes(buf[:idx])
                        del buf[: idx + 1]
                        if line:
                            text = line.decode("utf-8", errors="replace")
                            self.log_func(f"uart {text}")
        except Exception as exc:
            self.log_func(f"uart error {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local Arcade Coder paint UI with UART logging.")
    parser.add_argument("--address", default=base.DEFAULT_ADDRESS)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--uart-port", default="COM3")
    parser.add_argument("--uart-baud", type=int, default=230400)
    parser.add_argument("--no-uart", action="store_true")
    args = parser.parse_args()

    base.STATE = base.AppState(args.address)
    uart = UARTMonitor(None if args.no_uart else args.uart_port, args.uart_baud, base.STATE.session.add_log)
    uart.start()

    server = ThreadingHTTPServer((args.host, args.port), base.Handler)
    print(f"Paint UI: http://{args.host}:{args.port}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping.")


if __name__ == "__main__":
    main()
