"""Resource-limited format worker, communicates JSON via private stdin/stdout."""

import base64
import json
import resource
import sys

from .formats import export_docx, export_markdown, import_file, png_or_jpeg


def main():
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    try:
        request = json.loads(sys.stdin.buffer.read(24_000_000))
        action = request["action"]
        if action == "image":
            data = base64.b64decode(request["data"], validate=True)
            fmt = png_or_jpeg(data)
            result = {"src": f"data:image/{fmt};base64," + base64.b64encode(data).decode()}
        elif action == "import":
            result = import_file(request["name"], base64.b64decode(request["data"], validate=True))
        else:
            warnings = []
            if action == "docx":
                data = export_docx(request["content"], request["layout"])
            elif action == "md":
                data, warnings = export_markdown(request["content"])
            else:
                raise ValueError("未知格式")
            result = {"data": base64.b64encode(data).decode(), "warnings": warnings, "verified": True}
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:500]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
