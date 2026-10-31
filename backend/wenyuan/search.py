"""Local literal search, backed by SQLite FTS5 and immutable source chunks."""

import re

from .core import canonical, digest, uid


def write_source(db, document_id, name, data, text, warnings):
    chunks = split_source(text)
    if len(chunks) > 1000:
        raise ValueError("资料超过 1000 片段限制")
    identifier, version = uid(), digest(data.hex())
    db.execute(
        "INSERT INTO sources VALUES (?,?,?,?,?,?)",
        (identifier, document_id, name, version, data, canonical(warnings)),
    )
    db.executemany(
        "INSERT INTO chunks VALUES (?,?,?,?)",
        [(uid(), identifier, i, chunk) for i, chunk in enumerate(chunks)],
    )
    return {"id": identifier, "version": version, "chunks": len(chunks), "warnings": warnings}


def terms(query):
    # Token boundaries only; writing intent and semantic judgment belong to the model.
    words = re.findall(r"[a-zA-Z0-9_]{2,}|[\u3400-\u9fff]", query.lower())
    return set(words) | {a + b for a, b in zip(words, words[1:]) if len(a) == len(b) == 1}


def index_text(text):
    return " ".join(sorted(terms(text)))


def retrieve(store, owner, document_id, query, limit=6):
    store.get(owner, document_id)
    with store.connect() as db:
        return search_chunks(db, query, document_id=document_id, limit=limit)


def search_chunks(db, query, *, document_id=None, library_id=None, limit=6):
    # Callers establish ownership of the requested document or library first.
    if (document_id is None) == (library_id is None):
        raise ValueError("必须指定一个资料范围")
    query_terms = terms(query)
    if not query_terms:
        return []
    # Fixed literal query budget; long task instructions are still passed intact to the model.
    tokens = sorted(query_terms, key=lambda t: (-len(t), t))[:64]
    expression = " OR ".join('"' + token + '"' for token in tokens)
    if document_id is not None:
        rows = db.execute(
            """SELECT c.*,s.name,s.version,s.id AS source_id FROM chunks_fts f
               JOIN chunks c ON c.id=f.chunk_id JOIN sources s ON c.source_id=s.id
               WHERE chunks_fts MATCH ? AND s.document_id=? LIMIT 128""",
            (expression, document_id),
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT c.*,s.name,s.version,s.id AS source_id FROM chunks_fts f
               JOIN chunks c ON c.id=f.chunk_id JOIN sources s ON c.source_id=s.id
               JOIN library_sources ls ON ls.source_id=s.id
               WHERE chunks_fts MATCH ? AND ls.library_id=? LIMIT 128""",
            (expression, library_id),
        ).fetchall()
    matches = [
        {**dict(row), "score": len(query_terms & terms(row["text"])) / len(query_terms)} for row in rows
    ]
    return sorted(matches, key=lambda r: (-r["score"], r["source_id"], r["ordinal"]))[:limit]


def split_source(text):
    return [text[i : i + 900] for i in range(0, len(text), 800) if text[i : i + 900].strip()]
