#!/usr/bin/env python3
"""AI Animation proxy server for Arcade Coder.

Serves the frontend and bridges:
  - LMStudio chat API  (http://localhost:3000/api/v1/chat)
  - Arcade Coder board  (http://192.168.0.87:8766)

Usage:
    python server.py
    python server.py --host 0.0.0.0 --port 8770
    python server.py --board http://192.168.0.87:8766 --lmstudio http://localhost:3000
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent

DEFAULT_BOARD    = "http://192.168.0.87:8766"
DEFAULT_LMSTUDIO = "http://localhost:3000"
DEFAULT_MODEL    = "qwen/qwen3.6-27b"

BOARD_URL    = DEFAULT_BOARD
LMSTUDIO_URL = DEFAULT_LMSTUDIO
MODEL        = DEFAULT_MODEL


def _json_ok(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def _read_body(handler: BaseHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", "0"))
    return handler.rfile.read(length) if length else b""


def _proxy_post(url: str, body: bytes, content_type: str = "application/json") -> tuple[int, bytes, str]:
    """Forward a POST to `url`. Returns (status, body, content_type)."""
    req = Request(
        url,
        data=body,
        headers={
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
            "User-Agent": "ai-animation-proxy/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=600) as resp:
            return resp.status, resp.read(), resp.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), "application/json"


def _fetch_json(url: str, timeout: int = 15) -> tuple[int, object]:
    req = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "ai-animation-proxy/1.0",
    })
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode("utf-8"))
            except Exception:
                return resp.status, {
                    "error": "LM Studio returned non-JSON data",
                    "raw": raw.decode("utf-8", errors="replace")[:2000],
                }
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = {"error": raw.decode("utf-8", errors="replace")[:2000]}
        return exc.code, payload
    except Exception as exc:
        return 502, {"error": str(exc)}


def _normalise_models(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        raw_models = payload.get("models")
        if not isinstance(raw_models, list):
            raw_models = payload.get("data")
        if not isinstance(raw_models, list):
            raw_models = []
    elif isinstance(payload, list):
        raw_models = payload
    else:
        raw_models = []

    models = []
    seen = set()
    for item in raw_models:
        if isinstance(item, str):
            item = {"id": item}
        if not isinstance(item, dict):
            continue

        model_id = (
            item.get("id") or item.get("model") or item.get("key")
            or item.get("path") or item.get("name")
        )
        if not model_id or str(model_id) in seen:
            continue
        seen.add(str(model_id))

        loaded = item.get("loaded")
        if loaded is None:
            loaded = item.get("is_loaded")
        if loaded is None and "state" in item:
            loaded = str(item.get("state", "")).lower() in {
                "loaded", "ready", "running", "active"
            }

        models.append({
            "id": str(model_id),
            "name": str(item.get("display_name") or item.get("name") or model_id),
            "loaded": loaded,
            "type": item.get("type") or item.get("architecture") or item.get("format"),
            "context_length": (
                item.get("context_length") or item.get("max_context_length")
                or item.get("context_window")
            ),
            "size_bytes": item.get("size_bytes") or item.get("file_size"),
            "publisher": item.get("publisher") or item.get("organization"),
            "quantization": item.get("quantization") or item.get("quant"),
        })
    return models


def _board_config() -> dict[str, object]:
    parsed = urlparse(BOARD_URL)
    return {
        "boardUrl": BOARD_URL,
        "boardHost": parsed.hostname or "",
        "boardPort": parsed.port or (443 if parsed.scheme == "https" else 80),
        "lmstudioUrl": LMSTUDIO_URL,
        "model": MODEL,
    }


def _board_url_from_host_port(host: object, port: object) -> str:
    clean_host = str(host or "").strip()
    if not clean_host:
        raise ValueError("board host/IP is required")
    if any(char in clean_host for char in "/?#@") or any(char.isspace() for char in clean_host):
        raise ValueError("board host must be a hostname or IP address without a URL path")

    try:
        clean_port = int(port)
    except (TypeError, ValueError) as exc:
        raise ValueError("board port must be a number") from exc
    if not 1 <= clean_port <= 65535:
        raise ValueError("board port must be between 1 and 65535")

    # Brackets are required when an IPv6 address is placed in a URL.
    url_host = clean_host
    if ":" in clean_host and not clean_host.startswith("["):
        url_host = f"[{clean_host}]"
    return f"http://{url_host}:{clean_port}"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # ------------------------------------------------------------------
    # OPTIONS (CORS pre-flight)
    # ------------------------------------------------------------------
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ------------------------------------------------------------------
    # GET
    # ------------------------------------------------------------------
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path   = parsed.path

        # Config endpoint so the frontend knows the current settings
        if path == "/api/config":
            _json_ok(self, _board_config())
            return

        # Discover models available from LM Studio.
        if path == "/api/models":
            attempts = [
                f"{LMSTUDIO_URL}/api/v1/models",
                f"{LMSTUDIO_URL}/v1/models",
            ]
            errors = []
            for endpoint in attempts:
                status, payload = _fetch_json(endpoint)
                if 200 <= status < 300:
                    models = _normalise_models(payload)
                    _json_ok(self, {
                        "ok": True,
                        "source": endpoint,
                        "models": models,
                        "count": len(models),
                    })
                    return
                errors.append({
                    "endpoint": endpoint,
                    "status": status,
                    "response": payload,
                })

            _json_ok(self, {
                "ok": False,
                "error": "Could not retrieve a model list from LM Studio.",
                "attempts": errors,
            }, 502)
            return

        # Proxy board status
        if path == "/api/board/status":
            try:
                req = Request(f"{BOARD_URL}/api/status",
                              headers={"User-Agent": "ai-animation-proxy/1.0"})
                with urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
            except Exception as exc:
                _json_ok(self, {"ok": False, "error": str(exc)}, 502)
            return

        # Static file serving
        if path == "/" or path == "":
            path = "/index.html"

        file_path = (HERE / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(HERE)) or not file_path.exists():
            self.send_error(404)
            return

        content = file_path.read_bytes()
        ctype   = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    # ------------------------------------------------------------------
    # POST
    # ------------------------------------------------------------------
    def do_POST(self) -> None:
        global BOARD_URL

        parsed = urlparse(self.path)
        path   = parsed.path
        body   = _read_body(self)

        try:
            if path == "/api/config":
                payload = json.loads(body.decode("utf-8") or "{}")
                if not isinstance(payload, dict):
                    raise ValueError("configuration must be a JSON object")
                BOARD_URL = _board_url_from_host_port(
                    payload.get("boardHost"), payload.get("boardPort")
                )
                _json_ok(self, {"ok": True, **_board_config()})
                return

            if path == "/api/chat":
                # Let's check if the client requested streaming by parsing body
                try:
                    payload = json.loads(body.decode("utf-8"))
                    stream_requested = payload.get("stream", False)
                except Exception:
                    stream_requested = False

                if stream_requested:
                    req = Request(
                        f"{LMSTUDIO_URL}/api/v1/chat",
                        data=body,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": "ai-animation-proxy/1.0",
                        },
                        method="POST"
                    )
                    try:
                        with urlopen(req, timeout=600) as resp:
                            self.send_response(resp.status)
                            # Forward headers (e.g. text/event-stream)
                            for name, val in resp.headers.items():
                                if name.lower() not in ("content-length", "transfer-encoding"):
                                    self.send_header(name, val)
                            self.send_header("Access-Control-Allow-Origin", "*")
                            # No Content-Length for a live response; closing the connection
                            # marks the end of the stream for this simple proxy.
                            self.send_header("Connection", "close")
                            self.end_headers()

                            while True:
                                chunk = resp.read(64)
                                if not chunk:
                                    break
                                self.wfile.write(chunk)
                                self.wfile.flush()
                            self.close_connection = True
                            return
                    except urllib.error.HTTPError as exc:
                        _json_ok(self, {
                            "ok": False,
                            "error": exc.read().decode("utf-8", errors="replace")
                        }, exc.code)
                        return
                    except Exception as e:
                        _json_ok(self, {"ok": False, "error": str(e)}, 502)
                        return
                else:
                    # Non-streaming fallback
                    status, resp_body, ctype = _proxy_post(
                        f"{LMSTUDIO_URL}/api/v1/chat", body
                    )
                    self.send_response(status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(resp_body)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(resp_body)
                    return

            if path == "/api/board/start-paint":
                status, resp_body, _ = _proxy_post(
                    f"{BOARD_URL}/api/start-paint", body
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_body)
                return

            if path == "/api/board/send-frame":
                # Force the firmware-compatible literal-only DEFLATE mode even
                # when an older cached frontend omits the field.
                frame_body = json.loads(body.decode("utf-8"))
                frame_body.setdefault("compression", "huffman")
                forwarded_body = json.dumps(frame_body).encode("utf-8")
                status, resp_body, _ = _proxy_post(
                    f"{BOARD_URL}/api/send-rgb-buffer", forwarded_body
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_body)
                return

            if path == "/api/board/send-canvas":
                status, resp_body, _ = _proxy_post(
                    f"{BOARD_URL}/api/send-canvas", body
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp_body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_body)
                return

            self.send_error(404)
        except Exception as exc:
            _json_ok(self, {"ok": False, "error": str(exc)}, 500)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[HTTP] {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    global BOARD_URL, LMSTUDIO_URL, MODEL

    parser = argparse.ArgumentParser(description="AI Animation proxy server.")
    parser.add_argument("--host",      default="127.0.0.1")
    parser.add_argument("--port",      type=int, default=8770)
    parser.add_argument("--board",     default=DEFAULT_BOARD,    help="Board server URL")
    parser.add_argument("--lmstudio", default=DEFAULT_LMSTUDIO, help="LMStudio URL")
    parser.add_argument("--model",     default=DEFAULT_MODEL,    help="Default LMStudio model")
    args = parser.parse_args()

    BOARD_URL    = args.board
    LMSTUDIO_URL = args.lmstudio
    MODEL        = args.model

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"AI Animation Studio: http://{args.host}:{args.port}/")
    print(f"  Board:    {BOARD_URL}")
    print(f"  LMStudio: {LMSTUDIO_URL}")
    print(f"  Model:    {MODEL}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping.")


if __name__ == "__main__":
    main()
