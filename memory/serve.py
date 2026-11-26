"""Serve the archive on the same loopback origin on every launch."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial


class Handler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)

    def end_headers(self):
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    print("Open http://127.0.0.1:8765 in your browser.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8765), partial(Handler, directory=root)).serve_forever()
