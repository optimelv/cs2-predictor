"""Exercise the packaged default adapter using only an in-container HTTP fixture."""
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from server import FETCH_BACKEND, fetch_url, source_session


requests = []


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append(self.path)
        self.send_response(403 if self.path == "/blocked" else 200)
        self.end_headers()
        self.wfile.write(b"blocked" if self.path == "/blocked" else b"collector fixture")

    def log_message(self, *_):
        pass


async def check(base):
    assert FETCH_BACKEND == "scrapling-http", FETCH_BACKEND
    async with source_session() as session:
        assert await fetch_url(session, base + "/ok") == "collector fixture"
        try:
            await fetch_url(session, base + "/blocked")
        except RuntimeError as error:
            assert "HTTP 403" in str(error), str(error)
        else:
            raise AssertionError("Restricted fixture must fail without fallback")
    assert requests == ["/ok", "/blocked"], requests


if __name__ == "__main__":
    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    thread = Thread(target=fixture.serve_forever, daemon=True)
    thread.start()
    try:
        asyncio.run(check(f"http://127.0.0.1:{fixture.server_port}"))
        print("Packaged collector adapter and blocked-request behavior passed")
    finally:
        fixture.shutdown()
        fixture.server_close()
        thread.join()
