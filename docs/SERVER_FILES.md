# Server Files

There are two server entry points because UART logging is useful for hardware work but annoying as a default dependency.

## `app/server.py`

This is the base web UI/backend.

It provides:

- static page serving
- BLE connect/disconnect
- BLE device scanning
- device address config via `device_config.json`
- start built-in module API
- send compact canvas API
- Aurora/system/experiment helper APIs
- markdown rendering for `/docs/*.md`

Run it when you do not care about UART logs:

```bat
venv\Scripts\python.exe app\server.py
```

## `app/server_live.py`

This wraps `server.py` and adds UART mirroring into the web log.

It imports `server.py`, starts the same HTTP server, and also opens a serial port in a background thread. UART lines are copied into the UI log.

Run it while developing against hardware:

```bat
venv\Scripts\python.exe app\server_live.py
```

Default UART settings:

```text
COM3 @ 230400 baud
```

Disable UART if the port is not connected or another terminal has it open:

```bat
venv\Scripts\python.exe app\server_live.py --no-uart
```

Use a different UART port:

```bat
venv\Scripts\python.exe app\server_live.py --uart-port COM5
```

## Which one should git users run?

Start with `server_live.py --no-uart` if they are not wired to UART:

```bat
venv\Scripts\python.exe app\server_live.py --no-uart
```

Use plain `server.py` if they only want the web BLE controls and no serial logging at all.