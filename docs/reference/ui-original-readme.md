# Codex Paint UI

Local browser UI for controlling the Arcade Coder stock `paint` built-in.

## Run

From `C:\2026_projects\tech_coder`:

```powershell
venv\Scripts\python.exe codex_paint_ui\server.py
```

Open:

```text
http://127.0.0.1:8765/
```

## Modes

- **Known Canvas**: click cells that have captured single-pixel payloads, or send named captured multi-pixel canvases.
- **Discovery**: mutate bytes in a known payload, send it, then click the pixels/colours you saw to record observations in `codex_paint_ui/observations.jsonl`.

## Notes

This does not replace firmware. It starts the stock `paint` built-in and sends compact canvas bytes through the proven BLE paint frame-mode wrapper:

```text
Command type 4
PaintPayload.field1 = 0
PaintPayload.field2 = <compact canvas bytes>
```

