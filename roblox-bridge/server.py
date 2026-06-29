"""
Roblox Studio Bridge Server
A local HTTP middleware server that bridges Codely CLI and the Roblox Studio plugin.

Run: python server.py
Default port: 8080
"""

import json
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 8080

# Shared state
commands_queue = []      # Commands waiting to be picked up by the plugin
results_queue = []       # Results returned by the plugin
lock = threading.Lock()


class BridgeHandler(BaseHTTPRequestHandler):

    def _send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self._send_json(200, {"status": "ok"})

    def do_GET(self):
        """Plugin polls here for pending commands, or Codely checks results."""
        if self.path == "/poll":
            with lock:
                if commands_queue:
                    cmd = commands_queue.pop(0)
                    self._send_json(200, {"command": cmd})
                else:
                    self._send_json(200, {"command": None})

        elif self.path == "/results":
            with lock:
                results = list(results_queue)
                results_queue.clear()
                self._send_json(200, {"results": results})

        elif self.path == "/status":
            self._send_json(200, {
                "status": "running",
                "pending_commands": len(commands_queue),
                "pending_results": len(results_queue),
            })

        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        """Codely sends commands here, or plugin posts results."""
        if self.path == "/command":
            try:
                data = self._read_body()
                command = {
                    "id": f"cmd-{int(time.time() * 1000)}",
                    "action": data.get("action"),
                    "params": data.get("params", {}),
                    "timestamp": time.time(),
                }
                with lock:
                    commands_queue.append(command)
                print(f"[COMMAND] {command['action']} queued ({command['id']})")
                self._send_json(200, {"status": "queued", "id": command["id"]})
            except Exception as e:
                self._send_json(400, {"error": str(e)})

        elif self.path == "/result":
            try:
                data = self._read_body()
                result = {
                    "command_id": data.get("command_id"),
                    "status": data.get("status"),
                    "message": data.get("message", ""),
                    "data": data.get("data", {}),
                    "timestamp": time.time(),
                }
                with lock:
                    results_queue.append(result)
                print(f"[RESULT] {result['status']} for {result['command_id']}")
                self._send_json(200, {"status": "ok"})
            except Exception as e:
                self._send_json(400, {"error": str(e)})

        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, format, *args):
        # Cleaner console output
        pass


def main():
    server = HTTPServer((HOST, PORT), BridgeHandler)
    print(f"Roblox Studio Bridge running on http://{HOST}:{PORT}")
    print("Endpoints:")
    print("  POST /command   - Send a command to Studio")
    print("  GET  /poll      - Plugin polls for commands")
    print("  POST /result    - Plugin posts results")
    print("  GET  /results   - Check results")
    print("  GET  /status    - Server status")
    print()
    print("Waiting for connections...")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
