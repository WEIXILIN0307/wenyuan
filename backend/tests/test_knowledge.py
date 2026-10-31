import base64

from wenyuan.store import Store


def upload(client, library_id):
    response = client.post(
        f"/libraries/{library_id}/sources",
        files={"file": ("合成阅读资料.txt", "合成阅读活动在社区图书室举行，现场报名，不收费。".encode())},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_library_search_attach_retry_and_independent_reference_lifecycle(client, store, document):
    library = client.post("/libraries", json={"name": "合成资料库", "description": "人工编写样例"}).json()
    source = upload(client, library["id"])
    prefix = f"/libraries/{library['id']}"
    original = client.get(f"{prefix}/sources/{source['id']}").json()
    assert base64.b64decode(original["data"]).decode().startswith("合成阅读活动")
    hits = client.get(f"{prefix}/search", params={"q": "社区图书室"}).json()
    assert hits[0]["id"] == original["chunks"][0]["id"]
    assert hits[0]["version"] == source["version"]
    assert client.get("/libraries").json()[0]["file_count"] == 1

    attach_url = f"{prefix}/sources/{source['id']}/attach"
    attached = client.post(attach_url, json={"document_id": document["id"]}).json()
    repeated = client.post(attach_url, json={"document_id": document["id"]}).json()
    assert repeated["reused"] and attached["id"] == repeated["id"]
    assert store.get("alice", document["id"])["revision"] == document["revision"]
    refs = client.get(f"/documents/{document['id']}/sources").json()
    assert len(refs) == 1 and refs[0]["origin_library"] == "合成资料库"
    assert refs[0]["version"] == source["version"]
    assert client.get(f"/documents/{document['id']}/search", params={"q": "社区图书室"}).json()

    assert client.delete(prefix).status_code == 200
    assert not client.get("/libraries").json()
    assert client.get(f"{prefix}/sources/{source['id']}").status_code == 404
    # A deliberately selected document reference remains verifiable after library deletion.
    readback = client.get(f"/documents/{document['id']}/sources/{attached['id']}").json()
    assert readback["version"] == source["version"]
    with store.connect() as db:
        assert not db.execute("SELECT 1 FROM chunks_fts WHERE chunk_id=?", (hits[0]["id"],)).fetchone()
    client.delete(f"/documents/{document['id']}", params={"revision": document["revision"]})
    with store.connect() as db:
        assert not db.execute("SELECT 1 FROM source_origins").fetchone()
        assert not db.execute("SELECT 1 FROM sources").fetchone()
        assert not db.execute("SELECT 1 FROM chunks_fts").fetchone()


def test_library_permissions_include_originals_search_upload_and_attach(client, store, document):
    library = client.post("/libraries", json={"name": "私人合成库"}).json()
    source = upload(client, library["id"])
    bob_token = store.provision("bob-library-test")
    prefix = f"/libraries/{library['id']}"
    client.headers["Authorization"] = "Bearer " + bob_token
    assert client.get("/libraries").json() == []
    for path in (prefix + "/sources", prefix + "/search?q=阅读", prefix + "/sources/" + source["id"]):
        assert client.get(path).status_code == 404
    assert client.post(prefix + "/sources", files={"file": ("合成.txt", b"synthetic")}).status_code == 404
    assert client.delete(prefix + "/sources/" + source["id"]).status_code == 404
    assert client.delete(prefix).status_code == 404
    assert (
        client.post(
            prefix + "/sources/" + source["id"] + "/attach", json={"document_id": document["id"]}
        ).status_code
        == 404
    )
    other_library = client.post("/libraries", json={"name": "另一人的库"}).json()
    other_source = upload(client, other_library["id"])
    assert (
        client.post(
            f"/libraries/{other_library['id']}/sources/{other_source['id']}/attach",
            json={"document_id": document["id"]},
        ).status_code
        == 404
    )


def test_library_persistence_and_parser_boundary(client, store, document):
    assert client.post("/libraries", json={"name": "   "}).status_code == 422
    library = client.post("/libraries", json={"name": "持久化合成库"}).json()
    source = upload(client, library["id"])
    prefix = f"/libraries/{library['id']}"
    assert client.post(prefix + "/sources", files={"file": ("../escape.txt", b"test")}).status_code == 422
    assert client.post(prefix + "/sources", files={"file": ("macro.docm", b"test")}).status_code == 422
    assert (
        client.post(prefix + "/sources", files={"file": ("large.txt", b"x" * 10_000_001)}).status_code == 422
    )
    reopened = Store(store.path.parent)
    assert reopened.get("alice", document["id"])["content"] == document["content"]
    with reopened.connect() as db:
        assert db.execute("SELECT 1 FROM library_sources WHERE source_id=?", (source["id"],)).fetchone()
    client.delete(prefix + "/sources/" + source["id"])
    assert client.get(prefix + "/search", params={"q": "社区图书室"}).json() == []
