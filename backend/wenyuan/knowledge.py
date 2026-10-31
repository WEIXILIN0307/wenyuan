"""Small owner-scoped libraries; attached references are immutable document copies."""

import base64
import json

from .core import uid
from .search import search_chunks, write_source
from .store import now


class Knowledge:
    def __init__(self, store):
        self.store = store

    def _library(self, db, owner, library_id):
        row = db.execute("SELECT * FROM libraries WHERE id=? AND owner=?", (library_id, owner)).fetchone()
        if not row:
            raise KeyError("知识库不存在或无权限")
        return dict(row)

    def get(self, owner, library_id):
        with self.store.connect() as db:
            return self._library(db, owner, library_id)

    def _source(self, db, owner, library_id, source_id):
        self._library(db, owner, library_id)
        row = db.execute(
            "SELECT s.* FROM sources s JOIN library_sources ls ON ls.source_id=s.id "
            "WHERE ls.library_id=? AND s.id=?",
            (library_id, source_id),
        ).fetchone()
        if not row:
            raise KeyError("知识资料不存在或无权限")
        return row

    def list(self, owner):
        with self.store.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT l.*,COUNT(ls.source_id) AS file_count FROM libraries l "
                    "LEFT JOIN library_sources ls ON ls.library_id=l.id "
                    "WHERE l.owner=? GROUP BY l.id ORDER BY l.created DESC,l.id",
                    (owner,),
                )
            ]

    def create(self, owner, name, description):
        item = {"id": uid(), "owner": owner, "name": name, "description": description, "created": now()}
        with self.store.connect(True) as db:
            db.execute("INSERT INTO libraries VALUES (:id,:owner,:name,:description,:created)", item)
        return {**item, "file_count": 0}

    def files(self, owner, library_id):
        with self.store.connect() as db:
            self._library(db, owner, library_id)
            return [
                {**dict(r), "warnings": json.loads(r["warnings"])}
                for r in db.execute(
                    "SELECT s.id,s.name,s.version,s.warnings,LENGTH(s.original) AS bytes,ls.created,"
                    "COUNT(c.id) AS chunks FROM sources s JOIN library_sources ls ON ls.source_id=s.id "
                    "LEFT JOIN chunks c ON c.source_id=s.id WHERE ls.library_id=? GROUP BY s.id "
                    "ORDER BY ls.created DESC,s.id",
                    (library_id,),
                )
            ]

    def upload(self, owner, library_id, name, data, text, warnings):
        with self.store.connect(True) as db:
            self._library(db, owner, library_id)
            result = write_source(db, None, name, data, text, warnings)
            db.execute("INSERT INTO library_sources VALUES (?,?,?)", (result["id"], library_id, now()))
            return result

    def read(self, owner, library_id, source_id):
        with self.store.connect() as db:
            row = self._source(db, owner, library_id, source_id)
            return {
                "id": row["id"],
                "name": row["name"],
                "version": row["version"],
                "warnings": json.loads(row["warnings"]),
                "data": base64.b64encode(row["original"]).decode(),
                "chunks": [
                    dict(r)
                    for r in db.execute(
                        "SELECT id,ordinal,text FROM chunks WHERE source_id=? ORDER BY ordinal",
                        (source_id,),
                    )
                ],
            }

    def search(self, owner, library_id, query):
        with self.store.connect() as db:
            self._library(db, owner, library_id)
            return search_chunks(db, query, library_id=library_id)

    def delete(self, owner, library_id, source_id=None):
        with self.store.connect(True) as db:
            self._library(db, owner, library_id)
            if source_id:
                self._source(db, owner, library_id, source_id)
                db.execute("DELETE FROM sources WHERE id=?", (source_id,))
            else:
                db.execute(
                    "DELETE FROM sources WHERE id IN "
                    "(SELECT source_id FROM library_sources WHERE library_id=?)",
                    (library_id,),
                )
                db.execute("DELETE FROM libraries WHERE id=?", (library_id,))

    def attach(self, owner, library_id, source_id, document_id):
        with self.store.connect(True) as db:
            library = self._library(db, owner, library_id)
            source = self._source(db, owner, library_id, source_id)
            self.store._get(db, owner, document_id)
            existing = db.execute(
                "SELECT source_id FROM source_origins WHERE document_id=? AND library_source_id=?",
                (document_id, source_id),
            ).fetchone()
            if existing:
                return {"id": existing["source_id"], "version": source["version"], "reused": True}
            identifier = uid()
            db.execute(
                "INSERT INTO sources VALUES (?,?,?,?,?,?)",
                (
                    identifier,
                    document_id,
                    source["name"],
                    source["version"],
                    source["original"],
                    source["warnings"],
                ),
            )
            db.executemany(
                "INSERT INTO chunks VALUES (?,?,?,?)",
                [
                    (uid(), identifier, r["ordinal"], r["text"])
                    for r in db.execute(
                        "SELECT ordinal,text FROM chunks WHERE source_id=? ORDER BY ordinal",
                        (source_id,),
                    )
                ],
            )
            db.execute(
                "INSERT INTO source_origins VALUES (?,?,?,?)",
                (
                    identifier,
                    document_id,
                    source_id,
                    library["name"],
                ),
            )
            return {"id": identifier, "version": source["version"], "reused": False}
