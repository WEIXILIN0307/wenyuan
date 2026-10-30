from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, File, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from .ai import Generate, Provider, generate, prepare, retrieve, split_source, validate_provider_url
from .core import Conflict, Transaction, canonical, digest, plain, uid
from .store import Store


def convert(request):
    try:
        process = subprocess.run(
            [sys.executable, "-m", "wenyuan.worker"],
            input=canonical(request).encode(),
            capture_output=True,
            timeout=10,
            cwd=Path(__file__).resolve().parents[1],
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("格式处理超过 10 秒限制") from exc
    if process.returncode:
        raise ValueError("格式任务超过资源限制或解析失败")
    reply = json.loads(process.stdout)
    if not reply["ok"]:
        raise ValueError(reply["error"])
    return reply["result"]


class CreateDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="未命名文章", min_length=1, max_length=200)


class Login(BaseModel):
    token: str = Field(min_length=20, max_length=200)


def create_app(directory: Path | None = None):
    store = Store(directory or Path(os.environ.get("WENYUAN_DATA", ".data")))
    jobs: dict[str, asyncio.Task] = {}
    parse_slots = asyncio.Semaphore(2)

    @asynccontextmanager
    async def lifespan(app):
        with store.connect(True) as db:
            db.execute("UPDATE proposals SET state='interrupted' WHERE state='generating'")
        yield
        for job in jobs.values():
            job.cancel()
        await asyncio.gather(*jobs.values(), return_exceptions=True)

    app = FastAPI(title="文渊 API", version="0.1.0", lifespan=lifespan)
    app.state.store = store

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origins = os.environ.get(
                "WENYUAN_WEB_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000"
            ).split(",")
            if request.headers.get("sec-fetch-site") == "cross-site" or (
                request.headers.get("origin") and request.headers["origin"] not in origins
            ):
                return JSONResponse({"error": "禁止跨站写入"}, status_code=403)
            if int(request.headers.get("content-length", "0")) > 12_000_000:
                return JSONResponse({"error": "请求超过 12MB"}, status_code=413)
            data = bytearray()
            async for part in request.stream():
                data.extend(part)
                if len(data) > 12_000_000:
                    return JSONResponse({"error": "请求超过 12MB"}, status_code=413)
            request._body = bytes(data)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(Conflict)
    async def conflict(_, exc):
        return JSONResponse({"error": str(exc)}, status_code=409)

    @app.exception_handler(ValueError)
    async def invalid(_, exc):
        return JSONResponse({"error": str(exc)[:600]}, status_code=422)

    @app.exception_handler(KeyError)
    async def missing(_, exc):
        return JSONResponse({"error": str(exc)}, status_code=404)

    @app.exception_handler(Exception)
    async def failed(_, exc):
        return JSONResponse(
            {"error": "服务器处理或保存失败；请保留本地草稿，并按操作 ID 查询结果"}, status_code=500
        )

    def owner(
        authorization: str | None = Header(default=None), wy_session: str | None = Cookie(default=None)
    ):
        token = authorization.removeprefix("Bearer ") if authorization else wy_session
        user = store.authenticate(token) if token else None
        if not user:
            raise HTTPException(401, "请使用管理员创建的登录令牌登录")
        return user

    async def bounded_convert(body):
        async with parse_slots:
            return await run_in_threadpool(convert, body)

    async def uploaded(file: UploadFile):
        if (
            not file.filename
            or len(file.filename) > 240
            or "/" in file.filename
            or "\\" in file.filename
            or file.filename in {".", ".."}
        ):
            raise ValueError("上传文件名无效")
        data = await file.read(10_000_001)
        await file.close()
        if len(data) > 10_000_000:
            raise ValueError("上传文件超过 10MB")
        return file.filename, data

    @app.get("/health")
    def health():
        return {"status": "ok", "schema_version": 1}

    @app.post("/session")
    def login(body: Login, response: Response):
        user = store.authenticate(body.token)
        if not user:
            raise HTTPException(401, "登录令牌无效")
        response.set_cookie(
            "wy_session",
            body.token,
            httponly=True,
            samesite="strict",
            secure=os.environ.get("WENYUAN_SECURE_COOKIE") == "1",
            max_age=43200,
        )
        return {"user": user}

    @app.get("/session")
    def session(user=Depends(owner)):
        return {"user": user}

    @app.delete("/session")
    def logout(response: Response):
        response.delete_cookie("wy_session")
        return {"ok": True}

    @app.get("/documents")
    def documents(user=Depends(owner)):
        return store.list(user)

    @app.post("/documents", status_code=201)
    def create(body: CreateDocument, user=Depends(owner)):
        return store.create(user, body.title)

    @app.get("/documents/{doc_id}")
    def document(doc_id: str, user=Depends(owner)):
        return store.get(user, doc_id)

    @app.delete("/documents/{doc_id}")
    def delete(doc_id: str, revision: int, user=Depends(owner)):
        store.delete(user, doc_id, revision)
        return {"deleted": True}

    @app.post("/documents/{doc_id}/transactions")
    def transact(doc_id: str, body: Transaction, user=Depends(owner)):
        return store.transact(user, doc_id, body)

    @app.get("/operations/{operation_id}")
    def operation(operation_id: str, user=Depends(owner)):
        return store.operation(user, operation_id)

    @app.get("/documents/{doc_id}/history")
    def history(doc_id: str, user=Depends(owner)):
        return store.history(user, doc_id)

    @app.get("/documents/{doc_id}/operations")
    def operations(doc_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,state,received,executed,saved FROM operations WHERE document_id=? ORDER BY received DESC LIMIT 100",
                    (doc_id,),
                )
            ]

    @app.post("/documents/import", status_code=201)
    async def import_document(file: UploadFile = File(), user=Depends(owner)):
        name, data = await uploaded(file)
        result = await bounded_convert(
            {"action": "import", "name": name, "data": base64.b64encode(data).decode()}
        )
        doc = store.create(
            user,
            name.rsplit(".", 1)[0][:200],
            result["content"],
            result["layout"],
            original=(name, data, result["warnings"]),
        )
        return {"document": doc, "warnings": result["warnings"]}

    @app.get("/documents/{doc_id}/original")
    def original(doc_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect() as db:
            row = db.execute("SELECT * FROM imports WHERE document_id=?", (doc_id,)).fetchone()
        if not row:
            raise KeyError("此文档没有导入原件")
        return {
            "name": row["name"],
            "data": base64.b64encode(row["original"]).decode(),
            "warnings": json.loads(row["warnings"]),
        }

    @app.get("/documents/{doc_id}/export/{kind}")
    async def export(doc_id: str, kind: str, revision: int, user=Depends(owner)):
        doc = store.get(user, doc_id)
        if doc["revision"] != revision:
            raise Conflict("导出前版本已变化，请刷新")
        if kind == "json":
            data = canonical({k: doc[k] for k in ("schema_version", "content", "layout", "title")}).encode()
            return {
                "data": base64.b64encode(data).decode(),
                "warnings": [],
                "verified": json.loads(data)["content"] == doc["content"],
            }
        if kind not in {"docx", "md"}:
            raise ValueError("不支持此导出格式")
        return await bounded_convert({"action": kind, "content": doc["content"], "layout": doc["layout"]})

    @app.post("/images")
    async def image(file: UploadFile = File(), user=Depends(owner)):
        name, data = await uploaded(file)
        return await bounded_convert(
            {"action": "image", "name": name, "data": base64.b64encode(data).decode()}
        )

    @app.get("/documents/{doc_id}/sources")
    def sources(doc_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect() as db:
            return [
                {**dict(r), "warnings": json.loads(r["warnings"])}
                for r in db.execute(
                    "SELECT id,name,version,warnings FROM sources WHERE document_id=?", (doc_id,)
                )
            ]

    @app.post("/documents/{doc_id}/sources", status_code=201)
    async def source(doc_id: str, file: UploadFile = File(), user=Depends(owner)):
        store.get(user, doc_id)
        name, data = await uploaded(file)
        result = await bounded_convert(
            {"action": "import", "name": name, "data": base64.b64encode(data).decode()}
        )
        chunks = split_source(plain(result["content"]))
        if len(chunks) > 1000:
            raise ValueError("资料超过 1000 片段限制")
        identifier, version = uid(), digest(data.hex())
        with store.connect(True) as db:
            store._get(db, user, doc_id)
            db.execute(
                "INSERT INTO sources VALUES (?,?,?,?,?,?)",
                (identifier, doc_id, name, version, data, canonical(result["warnings"])),
            )
            db.executemany(
                "INSERT INTO chunks VALUES (?,?,?,?)",
                [(uid(), identifier, i, chunk) for i, chunk in enumerate(chunks)],
            )
        return {"id": identifier, "version": version, "chunks": len(chunks), "warnings": result["warnings"]}

    @app.get("/documents/{doc_id}/search")
    def search(doc_id: str, q: str = "", user=Depends(owner)):
        if len(q) > 12000:
            raise ValueError("查询过长")
        return retrieve(store, user, doc_id, q)

    @app.get("/documents/{doc_id}/sources/{source_id}")
    def read_source(doc_id: str, source_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect() as db:
            row = db.execute(
                "SELECT * FROM sources WHERE id=? AND document_id=?", (source_id, doc_id)
            ).fetchone()
            if not row:
                raise KeyError("资料不存在")
            chunks = [
                dict(r)
                for r in db.execute(
                    "SELECT id,ordinal,text FROM chunks WHERE source_id=? ORDER BY ordinal", (source_id,)
                )
            ]
            return {
                "name": row["name"],
                "version": row["version"],
                "data": base64.b64encode(row["original"]).decode(),
                "chunks": chunks,
            }

    @app.delete("/documents/{doc_id}/sources/{source_id}")
    def delete_source(doc_id: str, source_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect(True) as db:
            db.execute("DELETE FROM sources WHERE id=? AND document_id=?", (source_id, doc_id))
        return {"deleted": True}

    @app.get("/provider")
    def provider(user=Depends(owner)):
        return store.provider(user)

    @app.put("/provider")
    def save_provider(body: Provider, user=Depends(owner)):
        validate_provider_url(body.base_url)
        store.save_provider(user, body.model_dump())
        return store.provider(user)

    @app.post("/documents/{doc_id}/proposals", status_code=202)
    async def propose(doc_id: str, body: Generate, user=Depends(owner)):
        if sum(not j.done() for j in jobs.values()) >= 4:
            raise HTTPException(429, "当前模型任务已满，请稍后重试")
        identifier = prepare(store, user, doc_id, body)
        job = asyncio.create_task(generate(store, user, identifier))
        jobs[identifier] = job
        job.add_done_callback(lambda _: jobs.pop(identifier, None))
        return {"id": identifier, "state": "generating"}

    @app.get("/documents/{doc_id}/proposals/{proposal_id}")
    def proposal(doc_id: str, proposal_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect() as db:
            row = db.execute(
                "SELECT * FROM proposals WHERE document_id=? AND id=?", (doc_id, proposal_id)
            ).fetchone()
        if not row:
            raise KeyError("提案不存在")
        return {"id": proposal_id, "state": row["state"], **json.loads(row["body"])}

    @app.delete("/documents/{doc_id}/proposals/{proposal_id}")
    def reject(doc_id: str, proposal_id: str, user=Depends(owner)):
        store.get(user, doc_id)
        with store.connect(True) as db:
            changed = db.execute(
                "UPDATE proposals SET state=CASE state WHEN 'generating' THEN 'cancelled' ELSE 'rejected' END WHERE id=? AND document_id=? AND state IN ('generating','ready')",
                (proposal_id, doc_id),
            ).rowcount
        if not changed:
            raise Conflict("提案已终结，不能拒绝或取消")
        if proposal_id in jobs:
            jobs[proposal_id].cancel()
        return {"state": "rejected_or_cancelled"}

    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        create_app(), host="127.0.0.1", port=int(os.environ.get("WENYUAN_PORT", "8001")), access_log=False
    )
