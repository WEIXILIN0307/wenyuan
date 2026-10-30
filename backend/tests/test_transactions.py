from concurrent.futures import ThreadPoolExecutor
import sqlite3

import pytest

from wenyuan.core import Conflict, Transaction, apply_operations, digest, plain, uid, utf16_len, utf16_slice


def tx(doc, operations=None, operation_id=None):
    return Transaction(
        operation_id=operation_id or uid(),
        base_revision=doc["revision"],
        expected_hash=doc["content_hash"],
        operations=operations or [{"type": "metadata", "title": "已修改"}],
    )


def test_revision_idempotency_readback(store, document):
    request = tx(document)
    first = store.transact("alice", document["id"], request)
    assert first["state"] == "saved"
    assert store.transact("alice", document["id"], request) == first
    assert store.get("alice", document["id"])["revision"] == 1
    assert store.operation("alice", request.operation_id)["result"] == first
    assert store.history("alice", document["id"])[0]["body"]["title"] == "已修改"
    with pytest.raises(Conflict):
        store.transact("alice", document["id"], tx(document))
    altered = request.model_copy(update={"operations": [{"type": "metadata", "title": "复用 ID"}]})
    with pytest.raises(Conflict):
        store.transact("alice", document["id"], altered)


def test_two_tabs_atomic_cas(store, document):
    def submit(_):
        try:
            return store.transact("alice", document["id"], tx(document))["state"]
        except Conflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == ["conflict", "saved"]
    assert store.get("alice", document["id"])["revision"] == 1


def test_duplicate_text_targets_second_node(store, document):
    target = document["content"]["content"][1]
    op = {
        "type": "replace_text",
        "node_id": target["attrs"]["id"],
        "start": 0,
        "end": 4,
        "expected_hash": digest("重复文本"),
        "text": "明确定位",
    }
    result = store.transact("alice", document["id"], tx(document, [op]))["document"]
    assert plain(result["content"]) == "重复文本😀é\n明确定位😀é"


def test_original_hash_and_emoji_boundaries(document):
    target = document["content"]["content"][0]
    op = {
        "type": "replace_text",
        "node_id": target["attrs"]["id"],
        "start": 4,
        "end": 6,
        "expected_hash": digest("😀"),
        "text": "🌿",
    }
    assert "🌿é" in plain(apply_operations(document, [op])["content"])
    with pytest.raises(ValueError, match="代理对"):
        utf16_slice("😀", 0, 1)
    op["expected_hash"] = digest("错误原文")
    with pytest.raises(Conflict):
        apply_operations(document, [op])
    assert utf16_len("😀é") == 4


def test_replace_across_runs_preserves_surrounding_marks(document):
    p = document["content"]["content"][0]
    p["content"] = [
        {"type": "text", "text": "甲乙", "marks": [{"type": "bold"}]},
        {"type": "text", "text": "丙丁"},
    ]
    op = {
        "type": "replace_text",
        "node_id": p["attrs"]["id"],
        "start": 1,
        "end": 3,
        "expected_hash": digest("乙丙"),
        "text": "新",
    }
    out = apply_operations(document, [op])["content"]["content"][0]
    assert plain(out) == "甲新丁"
    assert out["content"][0]["marks"] == [{"type": "bold"}]


@pytest.mark.parametrize(
    "start,end,replacement,want",
    [
        (0, 0, "前", "前甲乙"),
        (1, 1, "中", "甲中乙"),
        (2, 2, "后", "甲乙后"),
        (0, 2, "", ""),
        (0, 1, "替", "替乙"),
    ],
)
def test_insert_replace_delete(document, start, end, replacement, want):
    p = document["content"]["content"][0]
    p["content"] = [{"type": "text", "text": "甲乙"}]
    op = {
        "type": "replace_text",
        "node_id": p["attrs"]["id"],
        "start": start,
        "end": end,
        "expected_hash": digest("甲乙"[start:end]),
        "text": replacement,
    }
    assert plain(apply_operations(document, [op])["content"]["content"][0]) == want


def test_atomic_failure_keeps_revision_and_no_receipt(store, document):
    request = tx(
        document,
        [
            {"type": "metadata", "title": "不能保存"},
            {"type": "snapshot", "content": {"type": "doc", "content": []}},
        ],
    )
    with pytest.raises(ValueError):
        store.transact("alice", document["id"], request)
    assert store.get("alice", document["id"])["revision"] == 0
    with pytest.raises(KeyError):
        store.operation("alice", request.operation_id)


def test_restore_is_a_new_transaction(store, document):
    edited = store.transact("alice", document["id"], tx(document))["document"]
    restored = store.transact(
        "alice",
        document["id"],
        tx(
            edited,
            [
                {"type": "snapshot", "content": document["content"]},
                {"type": "metadata", "title": document["title"]},
            ],
        ),
    )["document"]
    assert restored["revision"] == 2 and restored["title"] == document["title"]


def test_permissions_cascade_and_delete_conflict(client, store, document):
    assert client.get("/documents/" + document["id"]).status_code == 200
    bob = store.provision("bob2")
    assert (
        client.get("/documents/" + document["id"], headers={"Authorization": "Bearer " + bob}).status_code
        == 404
    )
    op = tx(document)
    store.transact("alice", document["id"], op)
    assert (
        client.get("/operations/" + op.operation_id, headers={"Authorization": "Bearer " + bob}).status_code
        == 404
    )
    assert client.delete(f"/documents/{document['id']}?revision=0").status_code == 409
    assert client.delete(f"/documents/{document['id']}?revision=1").status_code == 200
    with store.connect() as db:
        for table in ("documents", "revisions", "operations", "sources", "chunks", "proposals", "imports"):
            assert db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0


def test_database_write_error_rolls_back_without_claiming_saved(store, document):
    with store.connect(True) as db:
        db.execute(
            "CREATE TRIGGER synthetic_failure BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END"
        )
    request = tx(document)
    with pytest.raises(sqlite3.IntegrityError):
        store.transact("alice", document["id"], request)
    assert store.get("alice", document["id"])["revision"] == 0
    with pytest.raises(KeyError):
        store.operation("alice", request.operation_id)


def test_cookie_auth_csrf_and_unauthenticated(client):
    assert client.get("/documents", headers={"Authorization": "invalid"}).status_code == 401
    assert client.post("/documents", json={}, headers={"Origin": "https://evil.example"}).status_code == 403
    token = client.app.state.store.provision("cookie-user")
    response = client.post("/session", json={"token": token})
    assert (
        "HttpOnly" in response.headers["set-cookie"] and "SameSite=strict" in response.headers["set-cookie"]
    )
    assert (
        client.get("/session", headers={"Authorization": "Bearer " + token}).json()["user"] == "cookie-user"
    )
