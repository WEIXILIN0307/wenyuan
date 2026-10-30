"""Explicit test-only HTTP model simulator. Never imported by the application."""

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        instruction = json.loads(payload["messages"][-1]["content"])["instruction"]
        if "延迟" in instruction:
            time.sleep(2)
        text = "模拟提供商的改写结果（仅自动测试）"
        body = json.dumps(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {
                                    "text": text,
                                    "citations": [],
                                    "limitations": ["此结果由测试模拟器产生，不是真实模型验收"],
                                },
                                ensure_ascii=False,
                            )
                        },
                    }
                ],
                "usage": {"total_tokens": 1},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def do_GET(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 9207), Handler).serve_forever()
