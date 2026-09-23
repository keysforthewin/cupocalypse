"""Local Blender transfer bridge, restricted to task-owned boss assets."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'bosses'
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
            if path.suffix not in ['.glb','.blend','.json','.png']: raise ValueError('Invalid extension')
            length = int(self.headers['Content-Length'])
            if length > 200_000_000: raise ValueError('Too large')
            data = self.rfile.read(length)
            path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
            self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
        except Exception:
            self.send_response(400); self.end_headers()
ThreadingHTTPServer(('0.0.0.0',9878),Handler).serve_forever()
