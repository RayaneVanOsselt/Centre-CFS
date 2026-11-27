#!/usr/bin/env python3
"""Serveur local sans cache pour lancer les tests JavaScript dans le navigateur (sans Node).

    python3 site/build.py            # crée worker/src/generated/ (textes et routes du Worker)
    python3 scripts/serve-tests.py   # puis ouvrir http://localhost:8766/tests/browser/

Banc de bout en bout (site construit + vrai Worker + vrai moteur Apps Script, sans Node) : voir tests/browser/e2e.html.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".gs": "text/plain", ".json": "application/json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Service-Worker-Allowed", "/")  # banc de bout en bout : tests/browser/api-sw.js contrôle /dist/
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as srv:
        print(f"Tests : http://localhost:{PORT}/tests/browser/")
        srv.serve_forever()
