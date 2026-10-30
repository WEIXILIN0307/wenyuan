"""Preset instantiation and explainable checks; never edits document text."""

import json
import re
from datetime import date

from .core import Conflict, Layout, node, plain, walk
from .presets import PRESETS


def template(template_id):
    if template_id not in PRESETS:
        raise KeyError("模板不存在")
    spec = PRESETS[template_id]
    title = node("heading", spec["title"], level=1, align="center", spacing=24)
    title["content"][0]["marks"] = [
        {"type": "bold"},
        {"type": "style", "attrs": {"size": 24, "color": "#202020"}},
    ]
    blocks = [title]
    for section in spec["sections"]:
        blocks += [
            node("heading", section, level=2, spacing=12),
            node(text=f"【填写：{section}；依据核实后的资料补充，不确定的信息保留待核实】", spacing=12),
        ]
    return {
        "id": template_id,
        "name": spec["name"],
        "title": spec["title"],
        "content": {"type": "doc", "content": blocks},
        "layout": Layout(**{k: spec[k] for k in ("font", "font_size", "margin", "line_height")}).model_dump(),
        "guidance": spec["guidance"],
        "sections": spec["sections"],
        "notice": "本项目原创写作示例，不构成法定公文格式认证；未附带字体。",
    }


DATE = re.compile(
    r"(?<!\d)(\d{4})(?:年(\d{1,2})月(\d{1,2})日|-(\d{1,2})-(\d{1,2})(?!\d))(?:[ \t（(]*(?:星期|周)([一二三四五六日天])[）)]?)?"
)


def check_document(store, owner, doc_id, revision):
    doc = store.get(owner, doc_id)
    if doc["revision"] != revision:
        raise Conflict("检查前版本已经变化，请保存后重试")
    issues = []

    def issue(code, message, evidence, node_id=None):
        issues.append({"code": code, "message": message, "evidence": evidence, "node_id": node_id})

    headings = [n for n in walk(doc["content"]) if n["type"] == "heading"]
    if doc["title"] in {"未命名文章", "文章标题"} or not headings or not plain(headings[0]).strip():
        issue("title", "请核对文稿标题", "标题仍为默认名称，或正文没有非空标题节点。")
    paragraphs = [n for n in walk(doc["content"]) if n["type"] == "paragraph"]
    if not any(re.sub(r"【填写：[^】]*】", "", plain(n)).strip() for n in paragraphs):
        issue("body", "正文尚无实际内容", "正文段落为空或只有模板填写标记；标题不计作正文。")
    for n in paragraphs:
        for match in re.finditer(r"【填写：[^】]*】", plain(n)):
            issue("placeholder", "模板内容尚待填写", match.group(), n["attrs"]["id"])
    for n in walk(doc["content"]):
        if n["type"] not in {"paragraph", "heading"}:
            continue
        for match in DATE.finditer(plain(n)):
            year, cm, cd, im, idd, weekday = match.groups()
            try:
                actual = date(int(year), int(cm or im), int(cd or idd))
            except ValueError:
                issue("date", "日期不成立", f"原文：{match.group()}；公历中不存在此日期。", n["attrs"]["id"])
                continue
            expected = "一二三四五六日"[actual.weekday()]
            if weekday and weekday.replace("天", "日") != expected:
                issue(
                    "weekday",
                    "日期与星期不一致",
                    f"原文：{match.group()}；公历 {actual.isoformat()} 为星期{expected}。",
                    n["attrs"]["id"],
                )
    spec = PRESETS.get(doc.get("template_id"))
    if spec:
        titles = {plain(n).strip() for n in headings}
        for required in spec["sections"]:
            if required not in titles:
                issue(
                    "section",
                    f"缺少模板章节：{required}",
                    f"已绑定“{spec['name']}”模板，要求存在同名标题节点；只做字面结构核对。",
                )
    with store.connect() as db:
        rows = db.execute(
            "SELECT id,body FROM proposals WHERE document_id=? AND state='accepted'", (doc_id,)
        ).fetchall()
        for row in rows:
            for c in json.loads(row["body"]).get("citations", []):
                source = db.execute(
                    "SELECT s.version,c.text FROM sources s JOIN chunks c ON c.source_id=s.id WHERE s.document_id=? AND s.id=? AND c.id=?",
                    (doc_id, c["source_id"], c["chunk_id"]),
                ).fetchone()
                if not source or source["version"] != c["version"] or c["quote"] not in source["text"]:
                    issue(
                        "citation",
                        "已接受提案的引用来源失效",
                        f"提案 {row['id']}，资料 {c['name']}，版本 {c['version'][:12]}，片段 #{c['ordinal']}。这是历史操作依据；当前正文是否仍沿用需人工核对。",
                    )
    return {
        "revision": revision,
        "issues": issues,
        "checked": [
            "标题与正文",
            "填写标记",
            "公历日期与星期",
            "已绑定模板的必要标题",
            "已接受提案的引用来源",
        ],
        "limitations": "仅核对明确规则，不判断事实真伪、文采、法律效力，不给综合分。日期仅识别阿拉伯数字完整年月日/ISO日期及相邻星期。",
    }
