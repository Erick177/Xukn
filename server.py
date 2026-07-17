#!/usr/bin/env python3
"""
Local server for Replay Pro Ultra (main.js / index.html).

Run this file from inside "New folder (3)" (the same folder as index.html)
with:   python server.py
Then open:  http://localhost:8000/

It serves your static files (index.html, src/*, data/*) AND implements
the small backend API that main.js calls with fetch():
  GET  /data/                -> JSON list of files in ./data
  HEAD /data/<file>           -> 200 if file exists (handled by static server)
  GET  /api/bars?file=..&from=..&resolution=..&countBack=..
  GET  /sessions_backups.json / POST /save_sessions
  GET  /src/rules.json        / POST /save_rules
  GET  /src/theme.json        / POST /save_theme
"""

import http.server
import json
import os
import socketserver
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")

SESSIONS_FILE = os.path.join(ROOT, "sessions_backups.json")
RULES_FILE = os.path.join(ROOT, "rules.json")
THEME_FILE = os.path.join(ROOT, "theme.json")


def parse_time(raw):
    """Accepts an ISO date string, or a unix timestamp in ms or s."""
    raw = raw.strip()
    if not raw:
        return None
    try:
        # numeric timestamp
        num = float(raw)
        if num > 1e12:      # already ms
            return int(num)
        if num > 1e9:       # seconds
            return int(num * 1000)
        if num == 0:
            return 0
    except ValueError:
        pass
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def read_bars_from_csv(path, from_ms, count_back):
    """Reads a CSV: time,open,high,low,close,volume (header optional)."""
    bars = []
    if not os.path.isfile(path):
        return bars
    with open(path, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 5:
                continue
            t = parse_time(parts[0])
            if t is None:
                continue  # skips header row too
            try:
                o, h, l, c = (float(parts[1]), float(parts[2]),
                              float(parts[3]), float(parts[4]))
            except ValueError:
                continue
            v = float(parts[5]) if len(parts) > 5 and parts[5].strip() else 0
            if t > from_ms:
                bars.append({"time": t, "open": o, "high": h,
                             "low": l, "close": c, "volume": v})
    bars.sort(key=lambda b: b["time"])
    return bars[:count_back]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _serve_json_file(self, path, default):
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                try:
                    self._json(json.load(f))
                    return
                except json.JSONDecodeError:
                    pass
        self._json(default)

    def do_GET(self):
        parsed = urlparse(self.path)
        p = parsed.path

        if p == "/data/" or p == "/data":
            if not os.path.isdir(DATA_DIR):
                self._json([])
                return
            files = sorted(
                f for f in os.listdir(DATA_DIR)
                if os.path.isfile(os.path.join(DATA_DIR, f))
            )
            self._json(files)
            return

        if p == "/api/bars":
            qs = parse_qs(parsed.query)
            file_name = (qs.get("file") or [""])[0]
            from_raw = (qs.get("from") or ["0"])[0]
            count_back = int((qs.get("countBack") or ["5000"])[0])
            from_ms = parse_time(from_raw) or 0
            csv_path = os.path.join(DATA_DIR, file_name)
            bars = read_bars_from_csv(csv_path, from_ms, count_back)
            self._json(bars)
            return

        if p == "/sessions_backups.json":
            self._serve_json_file(SESSIONS_FILE, [])
            return

        if p == "/src/rules.json":
            self._serve_json_file(RULES_FILE, {"tabs": [], "activeTabId": None})
            return

        if p == "/src/theme.json":
            self._serve_json_file(THEME_FILE, {"themes": []})
            return

        super().do_GET()

    def do_POST(self):
        p = urlparse(self.path).path
        data = self._read_json_body()

        if p == "/save_sessions":
            with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._json({"ok": True})
            return

        if p == "/save_rules":
            with open(RULES_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._json({"ok": True})
            return

        if p == "/save_theme":
            with open(THEME_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._json({"ok": True})
            return

        self.send_response(404)
        self.end_headers()


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"Serving {ROOT}")
    print(f"Open: http://localhost:{PORT}/")
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        httpd.serve_forever()
