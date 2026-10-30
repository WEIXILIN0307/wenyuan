"""Generate only synthetic, redistributable interoperability fixtures."""

import base64
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from PIL import Image  # noqa: E402
from wenyuan.core import Layout, node, uid  # noqa: E402
from wenyuan.formats import export_docx, import_markdown  # noqa: E402


def main():
    examples = ROOT / "examples"
    imported = import_markdown((examples / "synthetic.md").read_bytes())
    image = io.BytesIO()
    Image.new("RGB", (120, 60), (62, 125, 88)).save(image, "PNG")
    (examples / "synthetic.png").write_bytes(image.getvalue())
    p = node(text="合成图片：")
    p["content"].append(
        {
            "type": "image",
            "attrs": {
                "id": uid(),
                "src": "data:image/png;base64," + base64.b64encode(image.getvalue()).decode(),
                "alt": "程序绘制的纯色合成图",
                "width": 120,
                "height": 60,
            },
        }
    )
    imported["content"]["content"].append(p)
    envelope = {
        "schema_version": 1,
        "title": "开源合成演示",
        "content": imported["content"],
        "layout": Layout().model_dump(),
    }
    (examples / "synthetic.json").write_text(json.dumps(envelope, ensure_ascii=False, indent=2) + "\n")
    (examples / "synthetic.docx").write_bytes(export_docx(envelope["content"], envelope["layout"]))
    print("Generated examples/synthetic.{json,docx,png} from original synthetic material")


if __name__ == "__main__":
    main()
