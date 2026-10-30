"""Local literal search, backed by SQLite FTS5 and immutable source chunks."""

import re


def terms(query):
    # Token boundaries only; writing intent and semantic judgment belong to the model.
    words = re.findall(r"[a-zA-Z0-9_]{2,}|[\u3400-\u9fff]", query.lower())
    return set(words) | {a + b for a, b in zip(words, words[1:]) if len(a) == len(b) == 1}


def index_text(text):
    return " ".join(sorted(terms(text)))


def retrieve(store, owner, document_id, query, limit=6):
    store.get(owner, document_id)
    query_terms = terms(query)
    if not query_terms:
        return []
    # Fixed literal query budget; long task instructions are still passed intact to the model.
    tokens = sorted(query_terms, key=lambda t: (-len(t), t))[:64]
    expression = " OR ".join('"' + token + '"' for token in tokens)
    with store.connect() as db:
        rows = db.execute(
            """SELECT c.*,s.name,s.version,s.id AS source_id FROM chunks_fts f
               JOIN chunks c ON c.id=f.chunk_id JOIN sources s ON c.source_id=s.id
               WHERE chunks_fts MATCH ? AND s.document_id=? LIMIT 128""",
            (expression, document_id),
        ).fetchall()
    matches = [
        {**dict(row), "score": len(query_terms & terms(row["text"])) / len(query_terms)} for row in rows
    ]
    return sorted(matches, key=lambda r: (-r["score"], r["source_id"], r["ordinal"]))[:limit]


def split_source(text):
    return [text[i : i + 900] for i in range(0, len(text), 800) if text[i : i + 900].strip()]
