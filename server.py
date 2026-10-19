"""Local Mana Portfolio HTTP server and Scryfall API proxy; standard library only."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json, os, time

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/prices':
            self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 100000:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(length))
            identifiers = data.get('identifiers')
            if not isinstance(identifiers, list) or not 1 <= len(identifiers) <= 75:
                raise ValueError('Expected 1–75 identifiers')
            if not all(isinstance(x,dict) and isinstance(x.get('id'),str) and len(x['id']) <= 50 for x in identifiers):
                raise ValueError('Invalid identifiers')
            payload = json.dumps({'identifiers': identifiers}).encode()
            req = Request('https://api.scryfall.com/cards/collection', data=payload,
                headers={'User-Agent':'ManaPortfolioLocal/1.0 (personal collection tracker)', 'Accept':'application/json', 'Content-Type':'application/json'}, method='POST')
            try:
                with urlopen(req, timeout=35) as r:
                    content = r.read(2_000_000)
                    code = r.status
            except HTTPError as e:
                code = e.code
                content = e.read(200000)
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(content)
        except (ValueError, json.JSONDecodeError) as e:
            self._json_error(400,str(e))
        except (URLError, TimeoutError, OSError) as e:
            self._json_error(502,'Scryfall connection failed: '+str(e))
        except Exception as e:
            self._json_error(500,str(e))

    def _json_error(self, code, msg):
        content=json.dumps({'error':msg}).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()

if __name__ == '__main__':
    print('Mana Portfolio running at http://localhost:8765')
    print('Keep this window open while using the dashboard. Ctrl+C to stop.')
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
