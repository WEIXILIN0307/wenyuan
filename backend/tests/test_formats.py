import base64
import io
import zipfile

import pytest
from PIL import Image

from wenyuan.api import convert
from wenyuan.core import Layout, node, plain, uid, validate_document
from wenyuan.formats import (
    export_docx,
    export_markdown,
    import_docx,
    import_file,
    import_markdown,
    signature,
    unzip,
)


def fixture_doc():
    title = node("heading", "合成活动方案", level=1, align="center", spacing=16)
    p = node(text="中文😀与é")
    p["content"] += [
        {
            "type": "text",
            "text": "重点",
            "marks": [
                {"type": "bold"},
                {"type": "italic"},
                {"type": "style", "attrs": {"size": 20, "color": "#cc3344"}},
            ],
        },
        {
            "type": "text",
            "text": "网站",
            "marks": [{"type": "link", "attrs": {"href": "https://example.org"}}],
        },
    ]
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "green").save(buf, "PNG")
    p["content"].append(
        {
            "type": "image",
            "attrs": {
                "id": uid(),
                "src": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
                "alt": "合成绿图",
                "width": 80,
                "height": 80,
            },
        }
    )
    listing = node("ordered_list", order=3)
    for text in ("第一项", "第二项"):
        item = node("list_item")
        item["content"] = [node(text=text)]
        listing["content"].append(item)
    table = node("table")
    for r in range(2):
        row = node("table_row")
        for c in range(2):
            cell = node("table_header" if r == 0 else "table_cell", colspan=1, rowspan=1, colwidth=None)
            cell["content"] = [node(text=f"合成{r}-{c}")]
            row["content"].append(cell)
        table["content"].append(row)
    return {"type": "doc", "content": [title, p, listing, table]}


def test_supported_docx_import_edit_export_readback():
    document = fixture_doc()
    data = export_docx(document, Layout().model_dump())
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert b"<Relationships xmlns=" in archive.read("_rels/.rels")
    imported = import_docx(data)
    assert signature(imported["content"]) == signature(document)
    imported["content"]["content"][0]["content"][0]["text"] += "（修订）"
    edited = export_docx(imported["content"], imported["layout"])
    assert "（修订）" in plain(import_docx(edited)["content"])


def test_bounded_worker_roundtrip_and_native_json():
    result = convert({"action": "docx", "content": fixture_doc(), "layout": Layout().model_dump()})
    assert result["verified"] and base64.b64decode(result["data"]).startswith(b"PK")
    with pytest.raises(ValueError):
        import_file("invalid.json", b'{"schema_version":999}')


def test_native_json_retains_title_and_image_upload_retains_dimensions(client):
    import json

    document = fixture_doc()
    payload = {
        "schema_version": 1,
        "title": "原生标题保留",
        "content": document,
        "layout": Layout().model_dump(),
    }
    response = client.post(
        "/documents/import", files={"file": ("different-name.json", json.dumps(payload).encode())}
    )
    assert response.status_code == 201, response.text
    assert response.json()["document"]["title"] == "原生标题保留"
    image = io.BytesIO()
    Image.new("RGB", (120, 60), "green").save(image, "PNG")
    result = client.post("/images", files={"file": ("synthetic.png", image.getvalue())})
    assert result.status_code == 200, result.text
    assert (result.json()["width"], result.json()["height"]) == (120, 60)


def test_markdown_supported_subset_roundtrip():
    data = "# 合成标题\n\n中文 **重点** 和 *斜体* [链接](https://example.org)\n\n3. 第一项\n4. 第二项\n\n| 名称 | 数量 |\n| --- | --- |\n| 合成 | 2 |\n".encode()
    imported = import_markdown(data)
    output, warnings = export_markdown(imported["content"])
    assert plain(import_markdown(output)["content"]) == plain(imported["content"])
    assert warnings


def zip_fixture(extra_name=None, extra_data=b"", xml=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        )
        z.writestr(
            "word/document.xml",
            xml
            or '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
        )
        if extra_name:
            z.writestr(extra_name, extra_data)
    return buf.getvalue()


@pytest.mark.parametrize("path", ["../escape", "/tmp/escape", "word/../../escape", "word\\escape"])
def test_zip_path_traversal(path):
    with pytest.raises(ValueError):
        unzip(zip_fixture(path, b"x"))


def test_zip_bomb_xxe_macros_and_unknown_file():
    with pytest.raises(ValueError, match="压缩比"):
        unzip(zip_fixture("word/bomb.bin", b"a" * 1_000_000))
    with pytest.raises(Exception):
        unzip(zip_fixture(xml='<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'))
    with pytest.raises(ValueError, match="宏"):
        import_docx(zip_fixture("word/vbaProject.bin", b"macro"))
    with pytest.raises(ValueError):
        import_file("test.docm", b"not supported")


def test_external_images_never_fetched():
    result = import_markdown(b"![private](http://169.254.169.254/latest/meta-data/)")
    assert any("未抓取" in w for w in result["warnings"])
    doc = {"type": "doc", "content": [node()]}
    doc["content"][0]["content"] = [
        {
            "type": "image",
            "attrs": {"id": uid(), "src": "http://127.0.0.1", "alt": "", "width": 10, "height": 10},
        }
    ]
    with pytest.raises(ValueError):
        validate_document(doc)


def test_complex_feature_warning_and_original_retention(client):
    xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p></w:body></w:document>'
    data = zip_fixture(xml=xml)
    response = client.post("/documents/import", files={"file": ("synthetic.docx", data)})
    assert response.status_code == 201, response.text
    result = response.json()
    assert any("footnoteReference" in w for w in result["warnings"])
    original = client.get(f"/documents/{result['document']['id']}/original").json()
    assert base64.b64decode(original["data"]) == data


def test_source_index_read_permissions_and_deletion(client, store, document):
    path = f"/documents/{document['id']}"
    response = client.post(
        path + "/sources", files={"file": ("合成资料.txt", "合成阅读活动将在图书室举办。预算为零。".encode())}
    )
    assert response.status_code == 201, response.text
    source_id = response.json()["id"]
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM chunks_fts").fetchone()[0] == response.json()["chunks"]
    matches = client.get(path + "/search?q=阅读活动").json()
    assert matches and matches[0]["source_id"] == source_id and matches[0]["version"]
    assert client.get(path + f"/sources/{source_id}").json()["chunks"][0]["text"].startswith("合成")
    assert client.delete(path + f"/sources/{source_id}").status_code == 200
    assert client.get(path + "/search?q=阅读活动").json() == []
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM chunks_fts").fetchone()[0] == 0
