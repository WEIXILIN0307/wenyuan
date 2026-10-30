"""Single-machine durable storage. JSON is canonical; history is immutable."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet

from .core import Conflict, Layout, Transaction, apply_operations, blank, canonical, digest, uid
from .search import index_text


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = directory / "wenyuan.sqlite3"
        key_path = directory / "provider.key"
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as f:
                f.write(Fernet.generate_key())
        self.cipher = Fernet(key_path.read_bytes())
        with self.connect() as db:
            db.executescript("""
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
              CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
                revision INTEGER NOT NULL, updated TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS revisions (
                document_id TEXT REFERENCES documents(id) ON DELETE CASCADE, revision INTEGER,
                body TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(document_id,revision));
              CREATE TABLE IF NOT EXISTS operations (
                id TEXT NOT NULL, owner TEXT NOT NULL, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                request_hash TEXT NOT NULL, state TEXT NOT NULL, result TEXT, received TEXT NOT NULL,
                executed TEXT, saved TEXT, PRIMARY KEY(owner,id));
              CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                name TEXT NOT NULL, version TEXT NOT NULL, original BLOB NOT NULL, warnings TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY, source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
                ordinal INTEGER NOT NULL, text TEXT NOT NULL);
              CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED,terms);
              CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
                INSERT INTO chunks_fts(chunk_id,terms) VALUES (new.id,wenyuan_terms(new.text));
              END;
              CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
                DELETE FROM chunks_fts WHERE chunk_id=old.id;
              END;
              CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
                DELETE FROM chunks_fts WHERE chunk_id=old.id;
                INSERT INTO chunks_fts(chunk_id,terms) VALUES (new.id,wenyuan_terms(new.text));
              END;
              INSERT INTO chunks_fts(chunk_id,terms) SELECT id,wenyuan_terms(text) FROM chunks
                WHERE id NOT IN (SELECT chunk_id FROM chunks_fts);
              CREATE TABLE IF NOT EXISTS providers (
                owner TEXT PRIMARY KEY REFERENCES users(id), body TEXT NOT NULL, encrypted_key TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS proposals (
                id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                state TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS imports (
                document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                name TEXT NOT NULL, original BLOB NOT NULL, warnings TEXT NOT NULL);
            """)
        os.chmod(self.path, 0o600)

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.create_function("wenyuan_terms", 1, index_text, deterministic=True)
        db.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def provision(self, name="local"):
        token = secrets.token_urlsafe(32)
        with self.connect(True) as db:
            db.execute("INSERT INTO users VALUES (?,?)", (name, digest(token)))
        return token

    def authenticate(self, token):
        with self.connect() as db:
            row = db.execute("SELECT id FROM users WHERE token_hash=?", (digest(token),)).fetchone()
            return row["id"] if row else None

    def _get(self, db, owner, identifier):
        row = db.execute("SELECT * FROM documents WHERE id=? AND owner=?", (identifier, owner)).fetchone()
        if not row:
            raise KeyError("文档不存在或无权限")
        body = json.loads(row["body"])
        return {
            **body,
            "id": identifier,
            "revision": row["revision"],
            "content_hash": digest(body),
            "updated": row["updated"],
            "schema_version": 1,
        }

    def get(self, owner, identifier):
        with self.connect() as db:
            return self._get(db, owner, identifier)

    def create(self, owner, title="未命名文章", content=None, layout=None, original=None, template_id=None):
        body = {"title": title, "content": content or blank(), "layout": layout or Layout().model_dump()}
        body = apply_operations(body, [{"type": "metadata", "title": title, "layout": body["layout"]}])
        if template_id is not None:
            body = apply_operations(body, [{"type": "metadata", "template_id": template_id}])
        identifier, stamp = uid(), now()
        with self.connect(True) as db:
            db.execute(
                "INSERT INTO documents VALUES (?,?,?,?,?)", (identifier, owner, canonical(body), 0, stamp)
            )
            db.execute("INSERT INTO revisions VALUES (?,?,?,?)", (identifier, 0, canonical(body), stamp))
            if original:
                name, data, warnings = original
                db.execute(
                    "INSERT INTO imports VALUES (?,?,?,?)", (identifier, name, data, canonical(warnings))
                )
            return self._get(db, owner, identifier)

    def list(self, owner):
        with self.connect() as db:
            return [
                {
                    "id": row["id"],
                    "title": json.loads(row["body"])["title"],
                    "revision": row["revision"],
                    "updated": row["updated"],
                }
                for row in db.execute("SELECT * FROM documents WHERE owner=? ORDER BY updated DESC", (owner,))
            ]

    def transact(self, owner, identifier, tx: Transaction):
        req_hash = digest({"document_id": identifier, **tx.model_dump()})
        with self.connect(True) as db:
            current = self._get(db, owner, identifier)
            previous = db.execute(
                "SELECT * FROM operations WHERE owner=? AND id=?", (owner, tx.operation_id)
            ).fetchone()
            if previous:
                if previous["request_hash"] != req_hash:
                    raise Conflict("幂等 ID 被不同请求复用")
                return json.loads(previous["result"])
            if current["revision"] != tx.base_revision or current["content_hash"] != tx.expected_hash:
                raise Conflict(f"文档版本冲突：当前 r{current['revision']}，请保留本地内容并重新打开")
            proposal = None
            if tx.proposal_id:
                proposal = db.execute(
                    "SELECT * FROM proposals WHERE id=? AND document_id=?", (tx.proposal_id, identifier)
                ).fetchone()
                if not proposal or proposal["state"] != "ready":
                    raise Conflict("提案不在可接受状态")
                p = json.loads(proposal["body"])
                if p["base_revision"] != tx.base_revision or canonical(p["operations"]) != canonical(
                    tx.operations
                ):
                    raise Conflict("提案目标或操作被改动")
                for citation in p.get("citations", []):
                    source = db.execute(
                        """SELECT s.version,c.text FROM sources s JOIN chunks c ON c.source_id=s.id
                                           WHERE s.document_id=? AND s.id=? AND c.id=?""",
                        (identifier, citation["source_id"], citation["chunk_id"]),
                    ).fetchone()
                    if (
                        not source
                        or source["version"] != citation["version"]
                        or citation["quote"] not in source["text"]
                    ):
                        raise Conflict("提案引用的资料已删除或变化，请重新生成")
            stamp = now()
            db.execute(
                "INSERT INTO operations (id,owner,document_id,request_hash,state,received) VALUES (?,?,?,?,?,?)",
                (tx.operation_id, owner, identifier, req_hash, "received", stamp),
            )
            body = {k: current[k] for k in ("title", "content", "layout")}
            if "template_id" in current:
                body["template_id"] = current["template_id"]
            edited = apply_operations(body, tx.operations)
            db.execute(
                "UPDATE operations SET state='executed',executed=? WHERE owner=? AND id=?",
                (now(), owner, tx.operation_id),
            )
            revision = current["revision"] + 1
            db.execute(
                "UPDATE documents SET body=?,revision=?,updated=? WHERE id=? AND revision=?",
                (canonical(edited), revision, stamp, identifier, current["revision"]),
            )
            db.execute(
                "INSERT INTO revisions VALUES (?,?,?,?)", (identifier, revision, canonical(edited), stamp)
            )
            readback = self._get(db, owner, identifier)
            if readback["content_hash"] != digest(edited):
                raise RuntimeError("写入回读校验失败")
            result = {
                "state": "saved",
                "operation_id": tx.operation_id,
                "document": readback,
                "received_at": stamp,
                "executed_at": now(),
                "saved_at": now(),
            }
            db.execute(
                "UPDATE operations SET state='saved',result=?,saved=? WHERE owner=? AND id=?",
                (canonical(result), now(), owner, tx.operation_id),
            )
            if proposal:
                db.execute("UPDATE proposals SET state='accepted' WHERE id=?", (tx.proposal_id,))
        # Verify again using a fresh connection after COMMIT; later edits may advance revision.
        with self.connect() as db:
            stored = db.execute(
                "SELECT body FROM revisions WHERE document_id=? AND revision=?", (identifier, revision)
            ).fetchone()
            if not stored or digest(json.loads(stored["body"])) != readback["content_hash"]:
                raise RuntimeError("持久化后回读失败，请查询操作状态")
        return result

    def delete(self, owner, identifier, revision):
        with self.connect(True) as db:
            doc = self._get(db, owner, identifier)
            if doc["revision"] != revision:
                raise Conflict("删除前文档版本已经变化")
            db.execute("DELETE FROM documents WHERE id=?", (identifier,))

    def operation(self, owner, identifier):
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM operations WHERE owner=? AND id=?", (owner, identifier)
            ).fetchone()
            if not row:
                raise KeyError("未找到此操作；没有已确认的持久化结果")
            return {
                "id": row["id"],
                "document_id": row["document_id"],
                "state": row["state"],
                "result": json.loads(row["result"]) if row["result"] else None,
            }

    def history(self, owner, identifier):
        with self.connect() as db:
            self._get(db, owner, identifier)
            return [
                {"revision": r["revision"], "created": r["created"], "body": json.loads(r["body"])}
                for r in db.execute(
                    "SELECT * FROM revisions WHERE document_id=? ORDER BY revision DESC LIMIT 100",
                    (identifier,),
                )
            ]

    def provider(self, owner, private=False):
        with self.connect() as db:
            row = db.execute("SELECT * FROM providers WHERE owner=?", (owner,)).fetchone()
            if not row:
                return None
            result = {
                **json.loads(row["body"]),
            }
            key = self.cipher.decrypt(row["encrypted_key"].encode()).decode()
            if private:
                result["api_key"] = key
            else:
                result["key_configured"] = bool(key)
            return result

    def save_provider(self, owner, body):
        key = body.pop("api_key")
        old = self.provider(owner, True)
        if key is None:
            key = old["api_key"] if old else ""
        with self.connect(True) as db:
            db.execute(
                "INSERT OR REPLACE INTO providers VALUES (?,?,?)",
                (owner, canonical(body), self.cipher.encrypt(key.encode()).decode()),
            )
