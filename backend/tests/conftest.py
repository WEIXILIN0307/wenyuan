import pytest
from fastapi.testclient import TestClient

from wenyuan.api import create_app
from wenyuan.core import node


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path)
    token = app.state.store.provision("alice")
    app.state.store.provision("bob")
    with TestClient(app, headers={"Authorization": "Bearer " + token}) as client:
        yield client


@pytest.fixture
def store(client):
    return client.app.state.store


@pytest.fixture
def document(store):
    return store.create(
        "alice", "合成测试", {"type": "doc", "content": [node(text="重复文本😀é"), node(text="重复文本😀é")]}
    )
