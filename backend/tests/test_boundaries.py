import subprocess

import pytest

from wenyuan.api import convert
from wenyuan.core import uid, validate_document


@pytest.mark.parametrize(
    "content",
    [
        {"type": "doc", "content": []},
        {"type": "doc", "content": [None]},
        {"type": "doc", "content": [{"type": "paragraph", "attrs": None}]},
        {"type": "doc", "content": [{"type": "unknown"}]},
        {"type": "doc", "attrs": {"untrusted": "x"}, "content": []},
    ],
)
def test_malformed_document_is_validation_failure(content):
    with pytest.raises(ValueError):
        validate_document(content)


@pytest.mark.parametrize(
    "op",
    [
        {"type": "replace_text"},
        {"type": "snapshot", "content": [], "extra": 1},
        {"type": "metadata", "title": 12},
        {"type": "append_blocks", "blocks": []},
        {"type": "delete_all"},
    ],
)
def test_malformed_operation_is_rejected_at_api_boundary(client, document, op):
    response = client.post(
        f"/documents/{document['id']}/transactions",
        json={
            "operation_id": uid(),
            "base_revision": 0,
            "expected_hash": document["content_hash"],
            "operations": [op],
        },
    )
    assert response.status_code == 422
    assert client.get(f"/documents/{document['id']}").json()["revision"] == 0


def test_file_size_and_path_limits(client):
    assert client.post("/documents/import", files={"file": ("../escape.txt", b"x")}).status_code == 422
    assert (
        client.post("/documents/import", files={"file": ("large.txt", b"x" * 10_000_001)}).status_code == 422
    )
    assert client.post("/documents/import", files={"file": ("bad.exe", b"x")}).status_code == 422


def test_conversion_wall_clock_timeout(monkeypatch):
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("synthetic worker", 10)

    monkeypatch.setattr(subprocess, "run", timeout)
    with pytest.raises(ValueError, match="10 秒"):
        convert({"action": "import", "name": "synthetic.txt", "data": ""})
