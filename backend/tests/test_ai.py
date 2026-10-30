import asyncio
import json

import httpx
import pytest

from wenyuan.ai import Generate, generate, prepare, validate_provider_url
from wenyuan.core import Conflict, Transaction, uid
from test_transactions import tx


@pytest.fixture
def provider(store, monkeypatch):
    monkeypatch.setenv("WENYUAN_MODEL_ORIGINS", "https://model.example")
    cfg = {
        "base_url": "https://model.example/v1",
        "model": "synthetic-test",
        "api_key": "test-key-not-real",
        "timeout": 1,
    }
    store.save_provider("alice", cfg.copy())
    return cfg


def completion(text="修改建议", citations=None, finish="stop"):
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "finish_reason": finish,
                    "message": {
                        "content": json.dumps(
                            {"text": text, "citations": citations or [], "limitations": []},
                            ensure_ascii=False,
                        )
                    },
                }
            ],
            "usage": {"total_tokens": 12},
        },
    )


def proposal_body(store, identifier):
    with store.connect() as db:
        row = db.execute("SELECT * FROM proposals WHERE id=?", (identifier,)).fetchone()
    return row["state"], json.loads(row["body"])


def request_for(document):
    return Generate(
        action="rewrite",
        instruction="改写所选文字",
        base_revision=0,
        node_id=document["content"]["content"][1]["attrs"]["id"],
        start=0,
        end=4,
    )


async def test_real_protocol_mock_proposal_requires_confirmation(store, document, provider):
    captured = []

    def respond(request):
        captured.append(json.loads(request.content))
        return completion("定位第二段")

    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(store, "alice", identifier, httpx.MockTransport(respond))
    state, body = proposal_body(store, identifier)
    assert state == "ready" and store.get("alice", document["id"])["revision"] == 0
    assert "没有工具调用权限" in captured[0]["messages"][0]["content"]
    assert "tools" not in captured[0]
    request = Transaction(
        operation_id=uid(),
        base_revision=0,
        expected_hash=document["content_hash"],
        operations=body["operations"],
        proposal_id=identifier,
    )
    saved = store.transact("alice", document["id"], request)
    assert saved["document"]["revision"] == 1
    assert saved["document"]["content"]["content"][0] == document["content"]["content"][0]
    assert proposal_body(store, identifier)[0] == "accepted"


async def test_stale_target_and_rejected_proposal(store, document, provider, client):
    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(store, "alice", identifier, httpx.MockTransport(lambda _: completion()))
    _, body = proposal_body(store, identifier)
    store.transact("alice", document["id"], tx(document))
    request = Transaction(
        operation_id=uid(),
        base_revision=0,
        expected_hash=document["content_hash"],
        operations=body["operations"],
        proposal_id=identifier,
    )
    with pytest.raises(Conflict):
        store.transact("alice", document["id"], request)
    assert client.delete(f"/documents/{document['id']}/proposals/{identifier}").status_code == 200
    assert proposal_body(store, identifier)[0] == "rejected"
    assert store.get("alice", document["id"])["revision"] == 1


@pytest.mark.parametrize("mode", ["truncated", "invalid", "timeout", "bad-citation", "http-error"])
async def test_model_failure_does_not_edit(store, document, provider, mode):
    def respond(_):
        if mode == "timeout":
            raise httpx.ReadTimeout("synthetic timeout")
        if mode == "invalid":
            return httpx.Response(
                200, json={"choices": [{"finish_reason": "stop", "message": {"content": "{broken"}}]}
            )
        if mode == "http-error":
            return httpx.Response(401, text="secret server information must not be persisted")
        return completion(
            finish="length" if mode == "truncated" else "stop",
            citations=[{"chunk_id": "unknown", "quote": "伪造"}] if mode == "bad-citation" else [],
        )

    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(store, "alice", identifier, httpx.MockTransport(respond))
    state, body = proposal_body(store, identifier)
    assert state == "failed" and "operations" not in body
    assert store.get("alice", document["id"])["revision"] == 0


async def test_cancel_during_generation(store, document, provider):
    started = asyncio.Event()

    async def respond(_):
        started.set()
        await asyncio.Event().wait()

    identifier = prepare(store, "alice", document["id"], request_for(document))
    job = asyncio.create_task(generate(store, "alice", identifier, httpx.MockTransport(respond)))
    await started.wait()
    job.cancel()
    await job
    assert proposal_body(store, identifier)[0] == "cancelled"
    assert store.get("alice", document["id"])["revision"] == 0


async def test_valid_citation_binds_source_version(store, document, provider):
    source_id, chunk_id = uid(), uid()
    with store.connect(True) as db:
        db.execute(
            "INSERT INTO sources VALUES (?,?,?,?,?,?)",
            (source_id, document["id"], "合成资料.txt", "v-test", b"synthetic", "[]"),
        )
        db.execute(
            "INSERT INTO chunks VALUES (?,?,?,?)",
            (chunk_id, source_id, 0, "改写资料：合成社区提供阅读空间。"),
        )
    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(
        store,
        "alice",
        identifier,
        httpx.MockTransport(
            lambda _: completion(citations=[{"chunk_id": chunk_id, "quote": "合成社区提供阅读空间"}])
        ),
    )
    state, body = proposal_body(store, identifier)
    assert state == "ready" and body["citations"][0]["version"] == "v-test"
    with store.connect(True) as db:
        db.execute("DELETE FROM sources WHERE id=?", (source_id,))
    request = Transaction(
        operation_id=uid(),
        base_revision=0,
        expected_hash=document["content_hash"],
        operations=body["operations"],
        proposal_id=identifier,
    )
    with pytest.raises(Conflict, match="资料"):
        store.transact("alice", document["id"], request)


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254",
        "http://localhost:22",
        "https://evil.example/v1",
        "https://model.example@evil.example",
        "https://model.example/v1/../admin",
        "file:///etc/passwd",
        "https://model.example/v1?x=1",
    ],
)
def test_model_ssrf_origin_allowlist(provider, url):
    with pytest.raises(ValueError):
        validate_provider_url(url)


def test_provider_key_encrypted_and_masked(store, provider, client):
    public = client.get("/provider").json()
    assert public["key_configured"] is True and "api_key" not in public
    assert "test-key-not-real" not in json.dumps(public)
    assert (
        client.put("/provider", json={k: provider[k] for k in ("base_url", "model", "timeout")}).status_code
        == 200
    )
    assert store.provider("alice", True)["api_key"] == "test-key-not-real"
    with store.connect() as db:
        row = db.execute("SELECT * FROM providers").fetchone()
        assert "test-key-not-real" not in row["encrypted_key"] + row["body"]


async def test_unconfigured_model_is_clear_failure(store, document):
    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(store, "alice", identifier)
    state, body = proposal_body(store, identifier)
    assert state == "failed" and "尚未配置" in body["error"]


@pytest.mark.parametrize("thinking", [None, False])
async def test_provider_thinking_extension_is_explicit_and_optional(store, document, provider, thinking):
    store.save_provider("alice", {**provider, "thinking": thinking})

    def respond(request):
        payload = json.loads(request.content)
        if thinking is None:
            assert "chat_template_kwargs" not in payload
        else:
            assert payload["chat_template_kwargs"] == {"thinking": False, "enable_thinking": False}
        return completion()

    identifier = prepare(store, "alice", document["id"], request_for(document))
    await generate(store, "alice", identifier, httpx.MockTransport(respond))
    assert proposal_body(store, identifier)[0] == "ready"
