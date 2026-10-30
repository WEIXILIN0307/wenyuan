
from wenyuan.core import Transaction, canonical, node, uid


def test_presets_use_existing_transactions_and_survive_native_roundtrip(client, store, document):
    templates = client.get("/templates").json()
    assert {t["id"] for t in templates} == {"notice", "summary", "brief", "article"}
    t = templates[0]
    tx = Transaction(
        operation_id=uid(),
        base_revision=0,
        expected_hash=document["content_hash"],
        operations=[
            {"type": "snapshot", "content": t["content"]},
            {"type": "metadata", "layout": t["layout"], "template_id": t["id"], "title": t["title"]},
        ],
    )
    saved = store.transact("alice", document["id"], tx)["document"]
    report = client.get(f"/documents/{document['id']}/checks?revision=1").json()
    assert any(i["code"] == "placeholder" for i in report["issues"])
    assert saved["template_id"] == "notice"
    exported = client.get(f"/documents/{document['id']}/export/json?revision=1").json()
    import base64

    response = client.post(
        "/documents/import", files={"file": ("roundtrip.json", base64.b64decode(exported["data"]))}
    )
    assert response.json()["document"]["template_id"] == "notice"


def test_checks_show_calendar_and_structure_evidence_and_reject_stale_revision(store, client):
    d = store.create(
        "alice",
        "合成检查",
        {
            "type": "doc",
            "content": [
                node("heading", "合成标题", level=1),
                node(text="活动于2026年10月30日（星期一）进行。2026-02-30。"),
            ],
        },
        template_id="notice",
    )
    result = client.get(f"/documents/{d['id']}/checks?revision=0").json()
    assert {"weekday", "date", "section"} <= {i["code"] for i in result["issues"]}
    assert any("星期五" in i["evidence"] for i in result["issues"])
    assert "score" not in result
    assert client.get(f"/documents/{d['id']}/checks?revision=2").status_code == 409


def test_preflight_matches_model_inputs_and_invalid_citation_is_explainable(store, client, document):
    path = f"/documents/{document['id']}"
    s = client.post(
        path + "/sources", files={"file": ("演示资料.txt", "合成阅读活动使用图书室。".encode())}
    ).json()
    context = client.post(
        path + "/writing-context",
        json={"action": "draft", "instruction": "根据阅读资料生成草稿", "base_revision": 0},
    ).json()
    assert context["document_context"] and context["sources"][0]["source_id"] == s["id"]
    chunk = context["sources"][0]
    with store.connect(True) as db:
        db.execute(
            "INSERT INTO proposals VALUES (?,?,?,?,?)",
            (
                uid(),
                document["id"],
                "accepted",
                canonical(
                    {
                        "citations": [
                            {
                                "source_id": s["id"],
                                "chunk_id": chunk["id"],
                                "version": s["version"],
                                "name": "演示资料.txt",
                                "ordinal": 0,
                                "quote": "合成阅读活动",
                            }
                        ]
                    }
                ),
                "synthetic",
            ),
        )
    client.delete(path + f"/sources/{s['id']}")
    report = client.get(path + "/checks?revision=0").json()
    assert any(i["code"] == "citation" and "历史" in i["evidence"] for i in report["issues"])
