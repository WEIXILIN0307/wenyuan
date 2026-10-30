"""Version-one document contract and pure transaction functions.

Text offsets use UTF-16 code units, matching ProseMirror. Hashes use UTF-8 SHA-256.
All persisted edits (including human snapshots) pass through apply_operations.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import uuid
from copy import deepcopy
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator
from PIL import Image


class Conflict(ValueError):
    pass


def uid() -> str:
    return uuid.uuid4().hex


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: Any) -> str:
    return hashlib.sha256((value if isinstance(value, str) else canonical(value)).encode()).hexdigest()


def node(kind="paragraph", text="", **attrs):
    return {
        "type": kind,
        "attrs": {"id": uid(), **attrs},
        "content": [{"type": "text", "text": text}] if text else [],
    }


def blank():
    return {"type": "doc", "content": [node()]}


def walk(root):
    yield root
    for child in root.get("content", []):
        yield from walk(child)


def plain(root):
    if root["type"] == "text":
        return root["text"]
    if root["type"] == "hard_break":
        return "\n"
    if root["type"] == "image":
        return "\ufffc"
    sep = "\n" if root["type"] not in {"paragraph", "heading"} else ""
    return sep.join(plain(c) for c in root.get("content", []))


def safe_link(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme in {"https", "http", "mailto"} and not any(ord(c) < 32 for c in url)


class Layout(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    width: float = Field(default=794, ge=400, le=1600)
    height: float = Field(default=1123, ge=400, le=2200)
    margin: float = Field(default=76, ge=16, le=200)
    font: str = Field(default="serif", pattern="^(serif|sans-serif)$")
    font_size: float = Field(default=16, ge=10, le=32)
    line_height: float = Field(default=1.7, ge=1, le=3)

    @model_validator(mode="after")
    def space(self):
        if self.width - self.margin * 2 < 150 or self.height - self.margin * 2 < 150:
            raise ValueError("页面正文区域过小")
        return self


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["snapshot"]
    content: dict


class ReplaceText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["replace_text"]
    node_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,80}$")
    start: int = Field(ge=0, strict=True)
    end: int = Field(ge=0, strict=True)
    expected_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    text: str = Field(max_length=100000)


class AppendBlocks(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["append_blocks"]
    blocks: list[dict] = Field(min_length=1, max_length=1000)


class Metadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["metadata"]
    title: str = Field(default="", min_length=1, max_length=200)
    layout: Layout | None = None


operation_adapter = TypeAdapter(
    Annotated[Snapshot | ReplaceText | AppendBlocks | Metadata, Field(discriminator="type")]
)


class Transaction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,80}$")
    base_revision: int = Field(ge=0)
    expected_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    operations: list[dict] = Field(min_length=1, max_length=100)
    proposal_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")

    @field_validator("operations")
    @classmethod
    def check_operations(cls, values):
        return [operation_adapter.validate_python(op).model_dump(exclude_unset=True) for op in values]


CHILDREN = {
    "doc": {"paragraph", "heading", "bullet_list", "ordered_list", "table"},
    "paragraph": {"text", "image", "hard_break"},
    "heading": {"text", "image", "hard_break"},
    "bullet_list": {"list_item"},
    "ordered_list": {"list_item"},
    "list_item": {"paragraph", "heading", "bullet_list", "ordered_list"},
    "table": {"table_row"},
    "table_row": {"table_cell", "table_header"},
    "table_cell": {"paragraph"},
    "table_header": {"paragraph"},
    "text": set(),
    "image": set(),
    "hard_break": set(),
}
ATTRS = {
    "paragraph": {"id", "align", "spacing"},
    "heading": {"id", "align", "spacing", "level"},
    "image": {"id", "src", "alt", "width", "height"},
    "ordered_list": {"id", "order"},
    "table_cell": {"id", "colspan", "rowspan", "colwidth"},
    "table_header": {"id", "colspan", "rowspan", "colwidth"},
}


def image_bytes(src: str) -> bytes:
    if not re.fullmatch(r"data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+", src):
        raise ValueError("只支持本地上传的 PNG/JPEG 图片；不抓取外部 URL")
    data = base64.b64decode(src.split(",", 1)[1], validate=True)
    if len(data) > 2_000_000:
        raise ValueError("单张图片超过 2MB")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in {"PNG", "JPEG"} or image.width * image.height > 12_000_000:
                raise ValueError("图片格式或像素超出限制")
            image.verify()
    except (OSError, Image.DecompressionBombError) as exc:
        raise ValueError("图片内容无效或像素超出限制") from exc
    return data


def _validate_document(root: dict) -> dict:
    if len(canonical(root).encode()) > 8_000_000:
        raise ValueError("正文 JSON 超过 8MB")
    ids: set[str] = set()
    count = 0

    def visit(n, depth=0):
        nonlocal count
        count += 1
        if depth > 16 or count > 20000:
            raise ValueError("文档结构过深或节点过多")
        if not isinstance(n, dict) or n.get("type") not in CHILDREN:
            raise ValueError("未知节点类型")
        t = n["type"]
        if set(n) - {"type", "attrs", "content", "marks", "text"}:
            raise ValueError("未知节点字段")
        a = n.get("attrs", {})
        if not isinstance(a, dict) or not isinstance(n.get("marks", []), list):
            raise ValueError("attrs/marks 类型无效")
        if set(a) - ATTRS.get(t, {"id"} if t not in {"doc", "text", "hard_break"} else set()):
            raise ValueError("未知节点属性")
        if t not in {"doc", "text", "hard_break"}:
            identifier = a.get("id", "")
            if (
                not isinstance(identifier, str)
                or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", identifier)
                or identifier in ids
            ):
                raise ValueError("节点 ID 缺失、非法或重复")
            ids.add(identifier)
        if t == "heading" and a.get("level", 1) not in range(1, 7):
            raise ValueError("标题层级无效")
        if a.get("align", "left") not in {"left", "center", "right", "justify"}:
            raise ValueError("对齐无效")
        if not isinstance(a.get("spacing", 8), (int, float)) or not 0 <= a.get("spacing", 8) <= 120:
            raise ValueError("段落间距无效")
        if t in {"table_cell", "table_header"} and (
            a.get("colspan", 1) != 1 or a.get("rowspan", 1) != 1 or a.get("colwidth") is not None
        ):
            raise ValueError("首版不支持合并单元格或单独列宽")
        if t == "table":
            widths = {len(row.get("content", [])) for row in n.get("content", [])}
            if len(widths) != 1 or not widths or not 1 <= next(iter(widths)) <= 20:
                raise ValueError("表格必须为最多 20 列的矩形")
        if t == "image":
            image_bytes(a.get("src", ""))
            for dim in ("width", "height"):
                if not isinstance(a.get(dim, 160), (int, float)) or not 1 <= a.get(dim, 160) <= 1600:
                    raise ValueError("图片尺寸无效")
            if len(a.get("alt", "")) > 500:
                raise ValueError("图片替代文本过长")
        if t == "ordered_list" and not 1 <= a.get("order", 1) <= 100000:
            raise ValueError("列表编号无效")
        if t == "text":
            if not isinstance(n.get("text"), str) or not n["text"] or len(n["text"]) > 1_000_000:
                raise ValueError("文本节点无效")
            # Lone surrogates and XML control characters are not portable document text.
            if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]", n["text"]):
                raise ValueError("文本含非法控制字符")
        elif "text" in n or n.get("marks"):
            raise ValueError("只有文本支持 text/marks")
        for mark in n.get("marks", []):
            mt, ma = mark.get("type"), mark.get("attrs", {})
            if mt not in {"bold", "italic", "link", "style"} or set(mark) - {"type", "attrs"}:
                raise ValueError("未知文字格式")
            if mt in {"bold", "italic"} and ma:
                raise ValueError("无效文字格式")
            if mt == "link" and (set(ma) != {"href"} or not safe_link(ma["href"])):
                raise ValueError("不安全链接")
            if mt == "style":
                if set(ma) - {"color", "size"} or not re.fullmatch(
                    r"#[0-9a-fA-F]{6}", ma.get("color", "#202020")
                ):
                    raise ValueError("文字颜色无效")
                if not isinstance(ma.get("size", 16), (int, float)) or not 8 <= ma.get("size", 16) <= 96:
                    raise ValueError("文字字号无效")
        children = n.get("content", [])
        if t == "list_item" and children and children[0].get("type") not in {"paragraph", "heading"}:
            raise ValueError("列表项必须以正文或标题段落开始")
        if not isinstance(children, list) or any(c.get("type") not in CHILDREN[t] for c in children):
            raise ValueError("节点嵌套不符合 schema")
        if (
            t
            in {
                "doc",
                "bullet_list",
                "ordered_list",
                "list_item",
                "table",
                "table_row",
                "table_cell",
                "table_header",
            }
            and not children
        ):
            raise ValueError("容器不能为空")
        for child in children:
            visit(child, depth + 1)

    if root.get("type") != "doc":
        raise ValueError("根节点必须是 doc")
    visit(root)
    return root


def validate_document(root: dict) -> dict:
    """Normalize malformed external structures into validation errors at the boundary."""
    try:
        return _validate_document(root)
    except (TypeError, KeyError, AttributeError, OverflowError, UnicodeError, RecursionError) as exc:
        raise ValueError("文档结构或字段类型无效") from exc


def utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def utf16_slice(text: str, start: int, end: int) -> str:
    if not 0 <= start <= end <= utf16_len(text):
        raise ValueError("UTF-16 范围越界")
    try:
        return text.encode("utf-16-le")[start * 2 : end * 2].decode("utf-16-le")
    except UnicodeDecodeError as exc:
        raise ValueError("范围不能拆分 emoji 代理对") from exc


def replace_text(root, op):
    if set(op) != {"type", "node_id", "start", "end", "expected_hash", "text"}:
        raise ValueError("replace_text 字段不符合契约")
    target = next((n for n in walk(root) if n.get("attrs", {}).get("id") == op["node_id"]), None)
    if target is None or target["type"] not in {"paragraph", "heading"}:
        raise Conflict("目标段落不存在")
    if any(n["type"] != "text" for n in target.get("content", [])):
        raise ValueError("AI 文字编辑暂不处理含图片或硬换行的段落，请改选纯文本段落")
    start, end = op["start"], op["end"]
    if type(start) is not int or type(end) is not int or not isinstance(op["text"], str):
        raise ValueError("文字操作字段类型无效")
    original = plain(target)
    if digest(utf16_slice(original, start, end)) != op["expected_hash"]:
        raise Conflict("目标原文已经变化，请重新生成")
    result, offset, inserted = [], 0, False
    for run in target.get("content", []):
        length = utf16_len(run["text"])
        left, right = max(0, min(length, start - offset)), max(0, min(length, end - offset))
        if offset + length <= start:
            result.append(deepcopy(run))
        elif offset >= end and inserted:
            result.append(deepcopy(run))
        else:
            prefix = utf16_slice(run["text"], 0, left)
            suffix = utf16_slice(run["text"], right, length)
            if prefix:
                result.append({**deepcopy(run), "text": prefix})
            if not inserted:
                if op["text"]:
                    result.append({**deepcopy(run), "text": op["text"]})
                inserted = True
            if suffix:
                result.append({**deepcopy(run), "text": suffix})
        offset += length
    if not inserted and op["text"]:
        result.append({"type": "text", "text": op["text"]})
    target["content"] = result


def apply_operations(document: dict, operations: list[dict]):
    result = deepcopy(document)
    seen: set[str] = set()
    for op in operations:
        kind = op.get("type")
        if kind == "snapshot":
            if (
                sum(o.get("type") == "snapshot" for o in operations) != 1
                or any(o.get("type") not in {"snapshot", "metadata"} for o in operations)
                or set(op) != {"type", "content"}
            ):
                raise ValueError("snapshot 只能与 metadata 一同提交")
            result["content"] = deepcopy(op["content"])
        elif kind == "replace_text":
            if op["node_id"] in seen:
                raise ValueError("每次事务同一段落只接受一个编辑范围")
            seen.add(op["node_id"])
            replace_text(result["content"], op)
        elif kind == "append_blocks":
            if set(op) != {"type", "blocks"} or not isinstance(op["blocks"], list):
                raise ValueError("append_blocks 字段无效")
            result["content"]["content"].extend(deepcopy(op["blocks"]))
        elif kind == "metadata":
            if set(op) - {"type", "title", "layout"}:
                raise ValueError("metadata 字段无效")
            if "title" in op:
                if not isinstance(op["title"], str) or not 1 <= len(op["title"].strip()) <= 200:
                    raise ValueError("标题长度应为 1—200")
                result["title"] = op["title"].strip()
            if "layout" in op:
                result["layout"] = Layout.model_validate(op["layout"]).model_dump()
        else:
            raise ValueError("未知事务类型")
    validate_document(result["content"])
    return result
