"""Restricted, original OOXML and Markdown adapters; no Office runtime.

Untrusted conversion is invoked in a bounded worker by the API.
"""

from __future__ import annotations

import base64
import io
import json
import posixpath
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

from defusedxml import ElementTree as SafeET
from markdown_it import MarkdownIt
from PIL import Image

from .core import Layout, image_bytes, node, plain, safe_link, uid, validate_document

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/package/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
for prefix, ns in [("w", W), ("r", R), ("a", A), ("wp", WP), ("pic", PIC)]:
    ET.register_namespace(prefix, ns)
ET.register_namespace("", P)  # LibreOffice's OPC detection requires default-namespace .rels roots.


def q(tag, ns=W):
    return f"{{{ns}}}{tag}"


def element(parent, tag, attrs=None, ns=W):
    return ET.SubElement(parent, q(tag, ns), {q(k, ns): str(v) for k, v in (attrs or {}).items()})


def png_or_jpeg(data):
    if len(data) > 2_000_000:
        raise ValueError("图片超过 2MB")
    Image.MAX_IMAGE_PIXELS = 12_000_000
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in {"PNG", "JPEG"} or image.width * image.height > 12_000_000:
            raise ValueError("仅支持最多 1200 万像素的 PNG/JPEG")
        image.verify()
        return "png" if image.format == "PNG" else "jpeg"


def unzip(data):
    if len(data) > 10_000_000:
        raise ValueError("文件超过 10MB")
    result = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if len(z.infolist()) > 512:
            raise ValueError("ZIP 文件项过多")
        total = 0
        for info in z.infolist():
            path = PurePosixPath(info.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in info.filename or info.flag_bits & 1:
                raise ValueError("不安全 ZIP 路径或加密包")
            total += info.file_size
            if (
                total > 40_000_000
                or info.file_size > 20_000_000
                or info.file_size > max(100_000, info.compress_size * 100)
            ):
                raise ValueError("ZIP 解压大小或压缩比超过限制")
            if info.filename in result:
                raise ValueError("ZIP 含重复文件名")
            result[info.filename] = z.read(info)
    if "word/document.xml" not in result or "[Content_Types].xml" not in result:
        raise ValueError("不是受支持的 DOCX")
    # Validate every XML part, including unused parts; never resolve entities.
    for name, content in result.items():
        if name.endswith((".xml", ".rels")):
            SafeET.fromstring(content, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    return result


def import_docx(data):
    files, warnings = unzip(data), []
    root = SafeET.fromstring(files["word/document.xml"])
    relations = {}
    if "word/_rels/document.xml.rels" in files:
        for rel in SafeET.fromstring(files["word/_rels/document.xml.rels"]):
            relations[rel.get("Id")] = rel.attrib
    unsupported = {
        "anchor",
        "object",
        "altChunk",
        "footnoteReference",
        "endnoteReference",
        "ins",
        "del",
        "oMath",
        "fldChar",
        "instrText",
        "cols",
        "pBdr",
        "vMerge",
        "gridSpan",
        "txbxContent",
        "sdt",
        "bookmarkStart",
        "commentReference",
    }
    seen = {e.tag.split("}")[-1] for e in root.iter()} & unsupported
    if seen:
        warnings.append("不支持的 DOCX 特性，可能丢失或降级：" + ", ".join(sorted(seen)))
    if any("vbaProject" in f or f.startswith("word/embeddings/") for f in files):
        raise ValueError("拒绝宏或嵌入对象")
    if any(re.search(r"word/(header|footer|footnotes|endnotes|comments)", f) for f in files):
        warnings.append("页眉页脚、脚注尾注和批注未导入；请核对保留的原件")
    # Resolve only our supported list subset. Unknown styles are explicitly lossy.
    nums, abstracts = {}, {}
    if "word/numbering.xml" in files:
        numbering = SafeET.fromstring(files["word/numbering.xml"])
        for abstract in numbering.findall(q("abstractNum")):
            lv = abstract.find(q("lvl"))
            if lv is not None:
                fmt, start = lv.find(q("numFmt")), lv.find(q("start"))
                abstracts[abstract.get(q("abstractNumId"))] = (
                    "bullet" if fmt is not None and fmt.get(q("val")) == "bullet" else "ordered",
                    int(start.get(q("val"), 1)) if start is not None else 1,
                )
        for num in numbering.findall(q("num")):
            a = num.find(q("abstractNumId"))
            nums[num.get(q("numId"))] = abstracts.get(a.get(q("val"))) if a is not None else None
    body = root.find(q("body"))
    if body is None:
        raise ValueError("DOCX 缺少正文")
    layout = Layout().model_dump()
    if "word/styles.xml" in files:
        defaults = SafeET.fromstring(files["word/styles.xml"]).find(
            q("docDefaults") + "/" + q("rPrDefault") + "/" + q("rPr")
        )
        if defaults is not None:
            size, font = defaults.find(q("sz")), defaults.find(q("rFonts"))
            if size is not None:
                value = float(size.get(q("val"), 24)) / 1.5
                if 10 <= value <= 32:
                    layout["font_size"] = value
                else:
                    warnings.append("基础字号超出范围，采用默认值")
            if font is not None:
                family = font.get(q("eastAsia"), font.get(q("ascii"), ""))
                if family == "Noto Sans CJK SC":
                    layout["font"] = "sans-serif"
                elif family != "Noto Serif CJK SC":
                    warnings.append("基础字体替换为本机字体；未附带原字体")
    line_settings = {
        float(s.get(q("line"))) / 240
        for s in root.iter(q("spacing"))
        if s.get(q("line")) and s.get(q("lineRule"), "auto") == "auto"
    }
    if len(line_settings) == 1 and 1 <= next(iter(line_settings)) <= 3:
        layout["line_height"] = next(iter(line_settings))
    elif line_settings:
        warnings.append("混合行距无法表示，采用统一默认行距")
    sects = list(root.iter(q("sectPr")))
    if len(sects) > 1:
        warnings.append("多节页面设置降级为首节")
    if sects:
        size, margins = sects[0].find(q("pgSz")), sects[0].find(q("pgMar"))
        if size is not None:
            layout.update(width=int(size.get(q("w"), 11910)) / 15, height=int(size.get(q("h"), 16845)) / 15)
        if margins is not None:
            values = [int(margins.get(q(k), 1140)) / 15 for k in ("top", "right", "bottom", "left")]
            layout["margin"] = values[0]
            if len(set(values)) > 1:
                warnings.append("首版统一四边页边距，已采用上边距")
        try:
            layout = Layout.model_validate(layout).model_dump()
        except ValueError:
            warnings.append("超出首版页面范围，已使用默认页面设置")
            layout = Layout().model_dump()

    def parse_paragraph(p):
        pp = p.find(q("pPr"))
        attrs = {}
        kind = "paragraph"
        list_info = None
        if pp is not None:
            st, jc, spacing = pp.find(q("pStyle")), pp.find(q("jc")), pp.find(q("spacing"))
            if st is not None:
                style = st.get(q("val"), "")
                if re.fullmatch(r"Heading[1-6]", style):
                    kind, attrs["level"] = "heading", int(style[-1])
                elif style not in {"Normal", ""}:
                    warnings.append(f"段落样式 {style} 降级为直接格式")
            if jc is not None:
                align = jc.get(q("val"), "left")
                attrs["align"] = (
                    "justify"
                    if align == "both"
                    else align
                    if align in {"left", "right", "center"}
                    else "left"
                )
            if spacing is not None:
                attrs["spacing"] = max(0, min(120, int(spacing.get(q("after"), 120)) / 15))
            np = pp.find(q("numPr"))
            if np is not None:
                ni, level = np.find(q("numId")), np.find(q("ilvl"))
                numid = ni.get(q("val")) if ni is not None else ""
                list_info = (numid, nums.get(numid) or ("bullet", 1))
                if level is not None and level.get(q("val"), "0") != "0":
                    warnings.append("嵌套/多级 DOCX 列表已展平")
        out = node(kind, **attrs)
        for child in p:
            href = None
            if child.tag == q("hyperlink"):
                rel = relations.get(child.get(q("id", R)), {})
                href = rel.get("Target")
                if not href or not safe_link(href):
                    warnings.append("不安全或内部书签链接已去除")
                    href = None
            runs = (
                [child]
                if child.tag == q("r")
                else list(child.findall(q("r")))
                if child.tag == q("hyperlink")
                else []
            )
            for run in runs:
                marks = []
                rp = run.find(q("rPr"))
                if rp is not None:
                    for fmt, mark in (("b", "bold"), ("i", "italic")):
                        value = rp.find(q(fmt))
                        if value is not None and value.get(q("val"), "1") not in {"0", "false"}:
                            marks.append({"type": mark})
                    color, size = rp.find(q("color")), rp.find(q("sz"))
                    style = {}
                    if color is not None and re.fullmatch(r"[0-9A-Fa-f]{6}", color.get(q("val"), "")):
                        style["color"] = "#" + color.get(q("val"))
                    if size is not None:
                        style["size"] = max(8, min(96, float(size.get(q("val"))) / 1.5))
                    if style:
                        marks.append({"type": "style", "attrs": {"size": 16, "color": "#202020", **style}})
                    if any(
                        x.tag not in {q(t) for t in ("b", "i", "color", "sz", "szCs", "rFonts")} for x in rp
                    ):
                        warnings.append("部分字符样式未支持（如下划线、背景、上标），请核对原件")
                if href:
                    marks.append({"type": "link", "attrs": {"href": href}})
                for part in run:
                    if part.tag == q("t") and part.text:
                        out["content"].append(
                            {"type": "text", "text": part.text, **({"marks": marks} if marks else {})}
                        )
                    elif part.tag == q("br"):
                        out["content"].append({"type": "hard_break"})
                    elif part.tag == q("tab"):
                        out["content"].append({"type": "text", "text": "\t"})
                    elif part.tag == q("drawing"):
                        if part.find(q("anchor", WP)) is not None:
                            warnings.append("浮动图片未导入")
                            continue
                        blip = part.find(".//" + q("blip", A))
                        rel = relations.get(blip.get(q("embed", R)), {}) if blip is not None else {}
                        target = rel.get("Target", "")
                        if rel.get("TargetMode") == "External" or not target:
                            warnings.append("外部图片未抓取")
                            continue
                        path = posixpath.normpath(posixpath.join("word", target))
                        if not path.startswith("word/media/") or path not in files:
                            warnings.append("图片路径不在受支持媒体目录")
                            continue
                        image = files[path]
                        fmt = png_or_jpeg(image)
                        extent = part.find(".//" + q("extent", WP))
                        width, height = (
                            (int(extent.get(k, 1524000)) / 9525 for k in ("cx", "cy"))
                            if extent is not None
                            else (160, 160)
                        )
                        desc = part.find(".//" + q("docPr", WP))
                        out["content"].append(
                            {
                                "type": "image",
                                "attrs": {
                                    "id": uid(),
                                    "src": f"data:image/{fmt};base64," + base64.b64encode(image).decode(),
                                    "alt": desc.get("descr", "") if desc is not None else "",
                                    "width": min(1600, max(1, width)),
                                    "height": min(1600, max(1, height)),
                                },
                            }
                        )
        return out, list_info

    blocks = []
    for child in body:
        if child.tag == q("p"):
            p, li = parse_paragraph(child)
            if li:
                numid, (fmt, start) = li
                kind = fmt + "_list"
                # Only join consecutive items of the same numId.
                if not blocks or blocks[-1].get("_num") != numid:
                    blocks.append(node(kind, **({"order": start} if fmt == "ordered" else {})))
                    blocks[-1]["_num"] = numid
                item = node("list_item")
                item["content"] = [p]
                blocks[-1]["content"].append(item)
            else:
                blocks.append(p)
        elif child.tag == q("tbl"):
            table = node("table")
            for tr in child.findall(q("tr")):
                row = node("table_row")
                is_header = tr.find(q("trPr") + "/" + q("tblHeader")) is not None
                for tc in tr.findall(q("tc")):
                    cell = node(
                        "table_header" if is_header else "table_cell", colspan=1, rowspan=1, colwidth=None
                    )
                    cell["content"] = [parse_paragraph(p)[0] for p in tc.findall(q("p"))] or [node()]
                    if tc.find(q("tbl")) is not None:
                        warnings.append("嵌套表格未导入")
                    row["content"].append(cell)
                if row["content"]:
                    table["content"].append(row)
            if table["content"]:
                max_cols = max(len(r["content"]) for r in table["content"])
                for row in table["content"]:
                    while len(row["content"]) < max_cols:
                        cell = node("table_cell", colspan=1, rowspan=1, colwidth=None)
                        cell["content"] = [node()]
                        row["content"].append(cell)
                blocks.append(table)
        elif child.tag != q("sectPr"):
            warnings.append("未知正文容器未导入：" + child.tag.split("}")[-1])
    for block in blocks:
        block.pop("_num", None)
    doc = {"type": "doc", "content": blocks or [node()]}
    validate_document(doc)
    warnings.append("仅导入首版子集；自定义样式继承、字体替换、节和高级排版可能有损，请保留原件核对")
    return {"content": doc, "layout": layout, "warnings": sorted(set(warnings))}


def export_docx(content, layout):
    validate_document(content)
    layout = Layout.model_validate(layout).model_dump()
    root = ET.Element(q("document"))
    body = element(root, "body")
    rels = ET.Element(q("Relationships", P))
    media = {}
    numbering = ET.Element(q("numbering"))
    list_counter = 0

    def relationship(target, kind, external=False):
        identifier = "rId" + str(len(rels) + 1)
        ET.SubElement(
            rels,
            q("Relationship", P),
            {
                "Id": identifier,
                "Target": target,
                "Type": R + "/" + kind,
                **({"TargetMode": "External"} if external else {}),
            },
        )
        return identifier

    relationship("styles.xml", "styles")
    relationship("numbering.xml", "numbering")

    def paragraph(parent, n, list_id=None):
        p, attrs = element(parent, "p"), n.get("attrs", {})
        pp = element(p, "pPr")
        if n["type"] == "heading":
            element(pp, "pStyle", {"val": "Heading" + str(attrs.get("level", 1))})
        align = attrs.get("align", "left")
        element(pp, "jc", {"val": "both" if align == "justify" else align})
        element(
            pp,
            "spacing",
            {
                "after": round(attrs.get("spacing", 8) * 15),
                "line": round(layout["line_height"] * 240),
                "lineRule": "auto",
            },
        )
        if list_id:
            np = element(pp, "numPr")
            element(np, "ilvl", {"val": 0})
            element(np, "numId", {"val": list_id})
        for inline in n.get("content", []):
            parent_run = p
            marks = inline.get("marks", [])
            link = next((m["attrs"]["href"] for m in marks if m["type"] == "link"), None)
            if link:
                parent_run = ET.SubElement(
                    p, q("hyperlink"), {q("id", R): relationship(link, "hyperlink", True)}
                )
            run = element(parent_run, "r")
            if inline["type"] == "text":
                rp = element(run, "rPr")
                for m in marks:
                    if m["type"] in {"bold", "italic"}:
                        element(rp, "b" if m["type"] == "bold" else "i")
                    elif m["type"] == "style":
                        element(rp, "color", {"val": m.get("attrs", {}).get("color", "#202020").lstrip("#")})
                        element(rp, "sz", {"val": round(m.get("attrs", {}).get("size", 16) * 1.5)})
                text = element(run, "t")
                text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                text.text = inline["text"]
            elif inline["type"] == "hard_break":
                element(run, "br")
            elif inline["type"] == "image":
                a = inline["attrs"]
                data = image_bytes(a["src"])
                fmt = png_or_jpeg(data)
                name = f"media/image{len(media) + 1}.{fmt}"
                media["word/" + name] = data
                rid = relationship(name, "image")
                drawing = element(run, "drawing")
                il = ET.SubElement(
                    drawing, q("inline", WP), {"distT": "0", "distB": "0", "distL": "0", "distR": "0"}
                )
                dims = {
                    "cx": str(round(a.get("width", 160) * 9525)),
                    "cy": str(round(a.get("height", 160) * 9525)),
                }
                ET.SubElement(il, q("extent", WP), dims)
                ET.SubElement(
                    il, q("docPr", WP), {"id": str(len(media)), "name": name, "descr": a.get("alt", "")}
                )
                graphic = ET.SubElement(il, q("graphic", A))
                gd = ET.SubElement(graphic, q("graphicData", A), {"uri": PIC})
                pic = ET.SubElement(gd, q("pic", PIC))
                nv = ET.SubElement(pic, q("nvPicPr", PIC))
                ET.SubElement(nv, q("cNvPr", PIC), {"id": "0", "name": name})
                ET.SubElement(nv, q("cNvPicPr", PIC))
                fill = ET.SubElement(pic, q("blipFill", PIC))
                ET.SubElement(fill, q("blip", A), {q("embed", R): rid})
                stretch = ET.SubElement(fill, q("stretch", A))
                ET.SubElement(stretch, q("fillRect", A))
                sp = ET.SubElement(pic, q("spPr", PIC))
                xfrm = ET.SubElement(sp, q("xfrm", A))
                ET.SubElement(xfrm, q("off", A), {"x": "0", "y": "0"})
                ET.SubElement(xfrm, q("ext", A), dims)
                geom = ET.SubElement(sp, q("prstGeom", A), {"prst": "rect"})
                ET.SubElement(geom, q("avLst", A))

    def blocks(parent, nodes):
        nonlocal list_counter
        for n in nodes:
            if n["type"] in {"paragraph", "heading"}:
                paragraph(parent, n)
            elif n["type"] in {"bullet_list", "ordered_list"}:
                list_counter += 1
                lid = list_counter
                abstract = element(numbering, "abstractNum", {"abstractNumId": lid})
                lvl = element(abstract, "lvl", {"ilvl": 0})
                element(lvl, "start", {"val": n.get("attrs", {}).get("order", 1)})
                element(lvl, "numFmt", {"val": "bullet" if n["type"] == "bullet_list" else "decimal"})
                element(lvl, "lvlText", {"val": "•" if n["type"] == "bullet_list" else "%1."})
                num = element(numbering, "num", {"numId": lid})
                element(num, "abstractNumId", {"val": lid})
                for item in n["content"]:
                    for i, child in enumerate(item["content"]):
                        if child["type"] in {"heading", "paragraph"}:
                            paragraph(parent, child, lid if i == 0 else None)
                        else:
                            raise ValueError("DOCX 首版不导出嵌套列表；请先展平")
            elif n["type"] == "table":
                table = element(parent, "tbl")
                props = element(table, "tblPr")
                borders = element(props, "tblBorders")
                for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
                    element(borders, side, {"val": "single", "sz": 4, "color": "CCCCCC"})
                grid = element(table, "tblGrid")
                for _ in n["content"][0]["content"]:
                    element(
                        grid,
                        "gridCol",
                        {
                            "w": round(
                                (layout["width"] - 2 * layout["margin"])
                                * 15
                                / len(n["content"][0]["content"])
                            )
                        },
                    )
                for row in n["content"]:
                    tr = element(table, "tr")
                    if all(c["type"] == "table_header" for c in row["content"]):
                        element(element(tr, "trPr"), "tblHeader")
                    elif any(c["type"] == "table_header" for c in row["content"]):
                        raise ValueError("DOCX 首版要求表头为完整行")
                    for cell in row["content"]:
                        blocks(element(tr, "tc"), cell["content"])

    blocks(body, content["content"])
    sect = element(body, "sectPr")
    element(sect, "pgSz", {"w": round(layout["width"] * 15), "h": round(layout["height"] * 15)})
    element(
        sect, "pgMar", {side: round(layout["margin"] * 15) for side in ("top", "right", "bottom", "left")}
    )
    styles = ET.Element(q("styles"))
    defaults = element(styles, "docDefaults")
    rp = element(element(defaults, "rPrDefault"), "rPr")
    element(
        rp,
        "rFonts",
        {
            "ascii": "Noto Serif CJK SC" if layout["font"] == "serif" else "Noto Sans CJK SC",
            "eastAsia": "Noto Serif CJK SC" if layout["font"] == "serif" else "Noto Sans CJK SC",
        },
    )
    element(rp, "sz", {"val": round(layout["font_size"] * 1.5)})
    for i in range(1, 7):
        st = element(styles, "style", {"type": "paragraph", "styleId": f"Heading{i}"})
        element(st, "name", {"val": f"heading {i}"})
        element(element(st, "pPr"), "outlineLvl", {"val": i - 1})
        element(element(st, "rPr"), "b")
    ct = ET.Element("Types", xmlns="http://schemas.openxmlformats.org/package/2006/content-types")
    for ext, mime in [
        ("rels", "application/vnd.openxmlformats-package.relationships+xml"),
        ("xml", "application/xml"),
        ("png", "image/png"),
        ("jpeg", "image/jpeg"),
    ]:
        ET.SubElement(ct, "Default", Extension=ext, ContentType=mime)
    for name, mime in [("document", "document.main"), ("styles", "styles"), ("numbering", "numbering")]:
        ET.SubElement(
            ct,
            "Override",
            PartName=f"/word/{name}.xml",
            ContentType=f"application/vnd.openxmlformats-officedocument.wordprocessingml.{mime}+xml",
        )
    package_rels = ET.Element(q("Relationships", P))
    ET.SubElement(
        package_rels,
        q("Relationship", P),
        {"Id": "rId1", "Type": R + "/officeDocument", "Target": "word/document.xml"},
    )
    parts = {
        "[Content_Types].xml": ct,
        "_rels/.rels": package_rels,
        "word/document.xml": root,
        "word/styles.xml": styles,
        "word/numbering.xml": numbering,
        "word/_rels/document.xml.rels": rels,
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
        for name, part in parts.items():
            z.writestr(name, ET.tostring(part, encoding="utf-8", xml_declaration=True))
        for name, data in media.items():
            z.writestr(name, data)
    data = output.getvalue()
    readback = import_docx(data)
    if signature(readback["content"]) != signature(content):
        raise ValueError("DOCX 回读结构校验失败，未交付导出文件")
    if (
        any(
            abs(readback["layout"][k] - layout[k]) > 0.34
            for k in ("width", "height", "margin", "font_size", "line_height")
        )
        or readback["layout"]["font"] != layout["font"]
    ):
        raise ValueError("DOCX 页面/基础字体回读校验失败")
    return data


def signature(doc):
    """Supported semantic projection, independent of random IDs and run splitting."""
    kind = doc["type"]
    a = doc.get("attrs", {})
    if kind in {"paragraph", "heading"}:
        runs = []
        for c in doc.get("content", []):
            sig = signature(c)
            if runs and c["type"] == "text" and runs[-1][0] == "text" and runs[-1][2] == sig[2]:
                runs[-1] = ("text", runs[-1][1] + sig[1], sig[2])
            else:
                runs.append(sig)
        return (
            kind,
            a.get("level", 1) if kind == "heading" else 0,
            a.get("align", "left"),
            round(a.get("spacing", 8), 1),
            runs,
        )
    if kind == "text":
        marks = sorted((m["type"], tuple(sorted(m.get("attrs", {}).items()))) for m in doc.get("marks", []))
        return kind, doc["text"], marks
    if kind == "image":
        return kind, a["src"], a.get("alt", ""), round(a.get("width", 160), 1), round(a.get("height", 160), 1)
    return (
        kind,
        a.get("order", 1) if kind == "ordered_list" else 0,
        [signature(c) for c in doc.get("content", [])],
    )


def import_markdown(data):
    text = data.decode("utf-8-sig")
    tokens = MarkdownIt("commonmark", {"html": False}).enable("table").parse(text)
    root = {"type": "doc", "content": []}
    stack = [root]
    warnings = ["Markdown 子集：段落、标题、粗斜体、链接、单层列表、简单表格；HTML/脚注/代码样式不保真"]

    def push(n):
        stack[-1].setdefault("content", []).append(n)
        stack.append(n)

    for t in tokens:
        if t.type in {"paragraph_open", "heading_open"}:
            push(node("heading", level=int(t.tag[1])) if t.type == "heading_open" else node())
        elif t.type in {
            "bullet_list_open",
            "ordered_list_open",
            "list_item_open",
            "table_open",
            "tr_open",
            "th_open",
            "td_open",
        }:
            kind = {"tr_open": "table_row", "th_open": "table_header", "td_open": "table_cell"}.get(
                t.type, t.type.removesuffix("_open")
            )
            n = node(kind, **({"order": int(t.attrGet("start") or 1)} if kind == "ordered_list" else {}))
            push(n)
            if kind in {"table_header", "table_cell"}:
                push(node())
        elif t.type in {"thead_open", "tbody_open", "thead_close", "tbody_close"}:
            continue
        elif t.type in {"th_close", "td_close"}:
            stack.pop()
            stack.pop()
        elif t.type.endswith("_close") and t.type.removesuffix("_close") in {
            "paragraph",
            "heading",
            "bullet_list",
            "ordered_list",
            "list_item",
            "table",
            "tr",
        }:
            stack.pop()
        elif t.type == "inline":
            marks = []
            for child in t.children or []:
                if child.type in {"strong_open", "em_open", "link_open"}:
                    m = {
                        "type": {"strong_open": "bold", "em_open": "italic", "link_open": "link"}[child.type]
                    }
                    if child.type == "link_open":
                        href = child.attrGet("href") or ""
                        if not safe_link(href):
                            raise ValueError("Markdown 链接不安全")
                        m["attrs"] = {"href": href}
                    marks.append(m)
                elif child.type in {"strong_close", "em_close", "link_close"}:
                    marks.pop()
                elif child.type in {"text", "code_inline", "softbreak"}:
                    value = "\n" if child.type == "softbreak" else child.content
                    if value:
                        stack[-1]["content"].append(
                            {"type": "text", "text": value, **({"marks": list(marks)} if marks else {})}
                        )
                elif child.type == "hardbreak":
                    stack[-1]["content"].append({"type": "hard_break"})
                elif child.type == "image":
                    src = child.attrGet("src") or ""
                    if src.startswith("data:image/"):
                        png_or_jpeg(image_bytes(src))
                        stack[-1]["content"].append(
                            {
                                "type": "image",
                                "attrs": {
                                    "id": uid(),
                                    "src": src,
                                    "alt": child.content,
                                    "width": 160,
                                    "height": 160,
                                },
                            }
                        )
                    else:
                        warnings.append("外部/相对路径图片未抓取：" + src[:100])
        elif t.type in {"fence", "code_block"}:
            stack[-1]["content"].append(node(text=t.content.rstrip("\n")))
    if not root["content"]:
        root["content"] = [node()]
    validate_document(root)
    return {"content": root, "layout": Layout().model_dump(), "warnings": warnings}


def export_markdown(content):
    warnings = ["Markdown 不保留字号、颜色、对齐、段距、页面及图片尺寸；复杂列表/表格会拒绝导出"]

    def inline(n):
        out = ""
        for c in n.get("content", []):
            if c["type"] == "hard_break":
                out += "  \n"
            elif c["type"] == "image":
                out += f"![{c['attrs'].get('alt', '')}]({c['attrs']['src']})"
            else:
                value = re.sub(r"([\\`*_{\[\]<>|!#])", r"\\\1", c["text"])
                for m in c.get("marks", []):
                    if m["type"] == "bold":
                        value = "**" + value + "**"
                    elif m["type"] == "italic":
                        value = "*" + value + "*"
                    elif m["type"] == "link":
                        value = f"[{value}](<{m['attrs']['href']}>)"
                out += value
        return out

    lines = []
    for n in content["content"]:
        t = n["type"]
        if t in {"paragraph", "heading"}:
            lines.append(("#" * n["attrs"].get("level", 1) + " " if t == "heading" else "") + inline(n))
        elif t in {"bullet_list", "ordered_list"}:
            rows = []
            for i, item in enumerate(n["content"]):
                if len(item["content"]) != 1 or item["content"][0]["type"] != "paragraph":
                    raise ValueError("Markdown 首版只导出每项单段的单层列表")
                rows.append(
                    ("- " if t == "bullet_list" else f"{n['attrs'].get('order', 1) + i}. ")
                    + inline(item["content"][0])
                )
            lines.append("\n".join(rows))
        elif t == "table":
            rows = []
            for row in n["content"]:
                if any(len(c["content"]) != 1 or "\n" in plain(c) for c in row["content"]):
                    raise ValueError("Markdown 表格仅支持单段单行单元格")
                rows.append("| " + " | ".join(inline(c["content"][0]) for c in row["content"]) + " |")
            rows.insert(1, "| " + " | ".join("---" for _ in n["content"][0]["content"]) + " |")
            lines.append("\n".join(rows))
    data = ("\n\n".join(lines) + "\n").encode()
    readback = import_markdown(data)
    # Text preservation is independently checked; empty paragraphs have no Markdown representation.
    if plain(readback["content"]).replace("\n", "") != plain(content).replace("\n", ""):
        raise ValueError("Markdown 导出回读文字不一致")
    return data, warnings


def import_file(name, data):
    if len(data) > 10_000_000:
        raise ValueError("上传文件超过 10MB")
    suffix = name.lower().rsplit(".", 1)[-1]
    if suffix == "docx":
        return import_docx(data)
    if suffix == "md":
        return import_markdown(data)
    if suffix == "txt":
        text = data.decode("utf-8-sig")
        doc = {"type": "doc", "content": [node(text=p) for p in text.splitlines()] or [node()]}
        validate_document(doc)
        return {"content": doc, "layout": Layout().model_dump(), "warnings": []}
    if suffix == "json":
        envelope = json.loads(data)
        if envelope.get("schema_version") != 1:
            raise ValueError("不支持的 JSON schema_version")
        validate_document(envelope["content"])
        layout = Layout.model_validate(envelope["layout"]).model_dump()
        return {"content": envelope["content"], "layout": layout, "warnings": []}
    raise ValueError("仅支持 UTF-8 txt/md、原生 JSON 与 DOCX；不解析宏、PDF、HTML 或旧 DOC")
