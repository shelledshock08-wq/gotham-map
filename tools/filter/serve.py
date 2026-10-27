#!/usr/bin/env python3
"""Serve the app and local WASM models for development. Production needs HTTPS."""
import argparse, functools, http.server
from pathlib import Path
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm':'application/wasm', '.tflite':'application/octet-stream', '.binarypb':'application/octet-stream', '.data':'application/octet-stream'}
    def end_headers(self):
        self.send_header('Permissions-Policy', 'camera=(self), microphone=(self)')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8010);parser.add_argument('--bind',default='0.0.0.0');args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    http.server.ThreadingHTTPServer((args.bind,args.port),functools.partial(Handler,directory=str(root))).serve_forever()
