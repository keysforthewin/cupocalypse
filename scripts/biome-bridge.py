"""Temporary local-network Blender asset bridge. Serves biome files only."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'biomes'
ROOT.mkdir(parents=True, exist_ok=True)
class Handler(BaseHTTPRequestHandler):
    def target(self):
        path = (ROOT / self.path.lstrip('/')).resolve()
        if ROOT not in path.parents or '..' in self.path: raise ValueError('Invalid path')
        return path
    def do_GET(self):
        try:
            data = self.target().read_bytes()
            self.send_response(200); self.end_headers(); self.wfile.write(data)
        except Exception:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        try:
            path = self.target()
            if path.suffix not in ['.glb', '.blend', '.json', '.png']: raise ValueError('Invalid extension')
            length = int(self.headers['Content-Length'])
            if length > 200_000_000: raise ValueError('File too large')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.rfile.read(length))
            self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
        except Exception:
            self.send_response(400); self.end_headers()
ThreadingHTTPServer(('0.0.0.0', 9877), Handler).serve_forever()
