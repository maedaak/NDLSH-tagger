import http.server
import socketserver
import threading
import urllib.request
import time
import sys

PORT = 8765

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def run():
    server = socketserver.TCPServer(("", PORT), Handler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    print(f"Server started on port {PORT}")

    time.sleep(0.5)

    urls = [
        f"http://localhost:{PORT}/index.html",
        f"http://localhost:{PORT}/css/style.css",
        f"http://localhost:{PORT}/js/dict.js",
        f"http://localhost:{PORT}/js/tagger.js",
        f"http://localhost:{PORT}/js/app.js",
        f"http://localhost:{PORT}/data/ndlsh.json"
    ]

    all_ok = True
    for u in urls:
        try:
            req = urllib.request.Request(u, method='HEAD')
            with urllib.request.urlopen(req) as res:
                size = res.headers.get('Content-Length', 'unknown')
                print(f"[OK] {u} -> status: {res.status}, size: {size}")
        except Exception as e:
            print(f"[FAIL] {u} -> error: {e}")
            all_ok = False

    server.shutdown()
    if all_ok:
        print("All static assets verified successfully!")
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    run()
