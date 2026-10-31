"use client";
import { useCallback, useEffect, useState } from "react";
import { api, download } from "../lib/model";

type Library = {
  id: string;
  name: string;
  description: string;
  file_count: number;
};
type Source = {
  id: string;
  name: string;
  version: string;
  chunks: number;
  bytes: number;
  created: string;
  warnings: string[];
};
type Chunk = { id: string; ordinal: number; text: string };
type Original = {
  id: string;
  name: string;
  version: string;
  chunks: Chunk[];
  warnings: string[];
  data: string;
};
type Hit = Chunk & { name: string; source_id: string; version: string };
type Props = {
  documents: { id: string; title: string }[];
  current: { id: string; title: string } | null;
  onDocument: (id: string) => Promise<void>;
  onAttach: (libraryId: string, sourceId: string) => Promise<void>;
  onWrite: () => void;
};

export default function KnowledgePage(props: Props) {
  const [libraries, setLibraries] = useState<Library[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const list = await api<Library[]>("/libraries");
    setLibraries(list);
    setSelectedId((previous) =>
      list.some((l) => l.id === previous) ? previous : list[0]?.id || null,
    );
  }, []);
  useEffect(() => {
    let active = true;
    load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  const selected = libraries.find((l) => l.id === selectedId);
  return (
    <section className="knowledge-page" aria-label="知识库内容">
      <aside className="library-sidebar">
        <header>
          <h2>资料库</h2>
          <button onClick={() => setCreating(true)} aria-label="新建知识库">
            ＋ 新建
          </button>
        </header>
        {loading && <p className="muted">正在加载…</p>}
        <nav aria-label="知识库列表">
          {libraries.map((l) => (
            <button
              key={l.id}
              aria-current={selectedId === l.id ? "page" : undefined}
              onClick={() => setSelectedId(l.id)}
            >
              <b>{l.name}</b>
              <small>{l.file_count} 份资料</small>
            </button>
          ))}
        </nav>
        {!loading && !libraries.length && (
          <p className="muted">尚未建立知识库</p>
        )}
        <p className="library-footnote">
          仅当前账号可见
          <br />
          SQLite 本地全文检索
        </p>
      </aside>
      <div className="knowledge-content">
        {error && (
          <p className="error" role="alert">
            {error}
            <button
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >
              重试
            </button>
          </p>
        )}
        {selected ? (
          <LibraryWorkspace
            key={selected.id}
            library={selected}
            onChange={load}
            onDelete={async () => {
              if (
                !window.confirm(
                  "删除此知识库及其资料？已添加到文稿的引用副本将保留。",
                )
              )
                return;
              try {
                await api(`/libraries/${selected.id}`, undefined, "DELETE");
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            {...props}
          />
        ) : (
          !loading && (
            <div className="empty">
              <h1>整理你的写作资料</h1>
              <p>按主题建立资料库，上传资料后检索原文，再选用到文稿。</p>
              <button className="primary" onClick={() => setCreating(true)}>
                创建知识库
              </button>
            </div>
          )
        )}
      </div>
      {creating && (
        <div className="modal-overlay">
          <form
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="新建知识库"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const item = await api<Library>("/libraries", {
                  name: name.trim(),
                  description: description.trim(),
                });
                await load();
                setSelectedId(item.id);
                setCreating(false);
                setName("");
                setDescription("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <header>
              <h2>新建知识库</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                取消
              </button>
            </header>
            <label>
              知识库名称
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              用途说明
              <textarea
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || !name.trim()}>
              创建
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function LibraryWorkspace({
  library,
  onChange,
  onDelete,
  documents,
  current,
  onDocument,
  onAttach,
  onWrite,
}: Props & {
  library: Library;
  onChange: () => Promise<void>;
  onDelete: () => void;
}) {
  const prefix = `/libraries/${library.id}`;
  const [files, setFiles] = useState<Source[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [tab, setTab] = useState("files");
  const [original, setOriginal] = useState<Original | null>(null),
    [focused, setFocused] = useState<string | null>(null),
    [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const reload = async () => setFiles(await api<Source[]>(`${prefix}/sources`));
  useEffect(() => {
    const c = new AbortController();
    api<Source[]>(`${prefix}/sources`, undefined, undefined, c.signal)
      .then(setFiles)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [prefix]);
  useEffect(() => {
    if (focused)
      document
        .getElementById(`knowledge-chunk-${focused}`)
        ?.scrollIntoView({ block: "center" });
  }, [focused, original]);
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await job();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const inspect = (id: string, chunk?: string) =>
    run(async () => {
      setOriginal(await api<Original>(`${prefix}/sources/${id}`));
      setFocused(chunk || null);
    });
  const filtered = files.filter((f) => f.name.includes(filter.trim()));
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{library.name}</h1>
          <p>{library.description || "管理可核对原文的写作资料"}</p>
        </div>
        <div className="button-row">
          <label className="import-button">
            {busy ? "处理中…" : "上传知识资料"}
            <input
              aria-label="上传知识资料"
              type="file"
              accept=".txt,.md,.docx,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                run(async () => {
                  const form = new FormData();
                  form.append("file", file);
                  const result = await api<{ warnings: string[] }>(
                    `${prefix}/sources`,
                    form,
                  );
                  await reload();
                  await onChange();
                  setHits(null);
                  setMessage(
                    result.warnings.join("；") || "上传完成，已建立片段索引。",
                  );
                });
              }}
            />
          </label>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={onDelete}
          >
            删除知识库
          </button>
        </div>
      </header>
      <div className="knowledge-stats">
        <span>{files.length} 份资料</span>
        <span>{files.reduce((n, f) => n + f.chunks, 0)} 个片段</span>
        <span>TXT / Markdown / DOCX / 文渊 JSON · 单文件 ≤ 10MB</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="knowledge-body">
        <section className="knowledge-files">
          <nav className="content-tabs" aria-label="知识资料视图">
            <button
              aria-current={tab === "files" ? "page" : undefined}
              onClick={() => setTab("files")}
            >
              文档
            </button>
            <button
              aria-current={tab === "search" ? "page" : undefined}
              onClick={() => setTab("search")}
            >
              检索资料库
            </button>
          </nav>
          {tab === "files" ? (
            <>
              <input
                className="file-filter"
                aria-label="筛选资料文件"
                placeholder="按文件名筛选"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {loading ? (
                <p role="status">正在读取资料…</p>
              ) : (
                <table className="knowledge-table">
                  <thead>
                    <tr>
                      <th>文档名称</th>
                      <th>状态 / 片段</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <button
                            className="file-name"
                            onClick={() => inspect(f.id)}
                            disabled={busy}
                          >
                            {f.name}
                          </button>
                          <small>
                            {(f.bytes / 1024).toFixed(1)} KB · v
                            {f.version.slice(0, 8)}
                          </small>
                        </td>
                        <td>
                          <span className="ready-label">
                            {f.chunks ? "可检索" : "无文本"}
                          </span>
                          <small>{f.chunks} 个片段</small>
                        </td>
                        <td>
                          <button onClick={() => inspect(f.id)} disabled={busy}>
                            查看原文
                          </button>
                          <button
                            className="text-button danger"
                            disabled={busy}
                            aria-label={`删除资料 ${f.name}`}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `删除 ${f.name}？文稿中的引用副本不受影响。`,
                                )
                              )
                                return;
                              run(async () => {
                                await api(
                                  `${prefix}/sources/${f.id}`,
                                  undefined,
                                  "DELETE",
                                );
                                if (original?.id === f.id) setOriginal(null);
                                setHits(null);
                                await reload();
                                await onChange();
                              });
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loading && !filtered.length && (
                <div className="catalog-empty">
                  {files.length
                    ? "没有匹配的文件。"
                    : "上传第一份资料，开始整理写作依据。"}
                </div>
              )}
            </>
          ) : (
            <>
              <form
                className="knowledge-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () =>
                    setHits(
                      await api<Hit[]>(
                        `${prefix}/search?q=${encodeURIComponent(query)}`,
                      ),
                    ),
                  );
                }}
              >
                <input
                  aria-label="知识库检索关键词"
                  placeholder="输入主题或原文关键词"
                  maxLength={12000}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button className="primary" disabled={busy || !query.trim()}>
                  检索
                </button>
              </form>
              <p className="muted">
                中文字符和双字词全文检索。命中只表示字面相关，请核对原文。
              </p>
              {hits?.map((h) => (
                <button
                  className="citation knowledge-hit"
                  key={h.id}
                  onClick={() => inspect(h.source_id, h.id)}
                  disabled={busy}
                >
                  <b>{h.name}</b>
                  <small>
                    v{h.version.slice(0, 8)} · 片段 #{h.ordinal}
                  </small>
                  <q>{h.text}</q>
                  <span>打开原始片段</span>
                </button>
              ))}
              {hits?.length === 0 && (
                <p className="catalog-empty">
                  没有找到匹配片段，请更换关键词。
                </p>
              )}
            </>
          )}
        </section>
        <aside className="knowledge-inspector" aria-label="资料原文">
          {original ? (
            <>
              <header>
                <div>
                  <h2>{original.name}</h2>
                  <small>
                    v{original.version.slice(0, 12)} · {original.chunks.length}{" "}
                    个片段
                  </small>
                </div>
                <button
                  aria-label="关闭资料原文"
                  onClick={() => setOriginal(null)}
                >
                  ×
                </button>
              </header>
              <div className="reference-actions">
                <label>
                  写作目标
                  <select
                    aria-label="资料添加目标文稿"
                    value={current?.id || ""}
                    onChange={(e) => onDocument(e.target.value)}
                  >
                    <option value="" disabled>
                      先选择一篇文稿
                    </option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={busy || !current}
                    onClick={() =>
                      run(async () => {
                        await onAttach(library.id, original.id);
                        setMessage(
                          "已添加引用副本到文稿；重复点击不会重复添加。",
                        );
                      })
                    }
                  >
                    添加到当前文稿
                  </button>
                  <button
                    onClick={() => download(original.name, original.data)}
                  >
                    下载原件
                  </button>
                </div>
                <button
                  className="text-button"
                  disabled={!current}
                  onClick={onWrite}
                >
                  前往写作工作台 →
                </button>
                <small>
                  添加后作为独立引用副本保存，知识库删除或更新不会覆盖本次依据。
                </small>
              </div>
              <div className="original-chunks">
                {original.warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
                {original.chunks.map((c) => (
                  <section
                    id={`knowledge-chunk-${c.id}`}
                    className={`chunk ${focused === c.id ? "focused" : ""}`}
                    key={c.id}
                  >
                    <small>片段 #{c.ordinal}</small>
                    {c.text}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <h2>资料原文</h2>
              <p>选择文档或检索命中，可核对片段、资料版本与原始文件。</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
