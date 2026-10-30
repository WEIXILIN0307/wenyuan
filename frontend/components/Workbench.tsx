"use client";
import { useEffect, useRef, useState } from "react";
import { diffChars } from "diff";
import Editor, { type EditorHandle } from "./Editor";
import PagePreview from "./PagePreview";
import {
  api,
  download,
  outline,
  textOf,
  type Document,
  type DocNode,
  type Selection,
  type Operation,
} from "../lib/model";
import { SaveQueue, type Recovery } from "../lib/save";
import { recoveryKey, otherDrafts } from "../lib/recovery";
import TemplatePicker, { type Template } from "./TemplatePicker";
import ChecksPanel from "./ChecksPanel";
import WritingContext, { type InputContext } from "./WritingContext";

type DocSummary = {
  id: string;
  title: string;
  revision: number;
  updated: string;
};
type Source = { id: string; name: string; version: string; warnings: string[] };
type Proposal = {
  document_context?: string;
  sources?: InputContext["sources"];
  template?: InputContext["template"];
  id: string;
  state: string;
  original?: string;
  suggested?: string;
  error?: string;
  base_revision: number;
  operations: Operation[];
  citations: any[];
  limitations: string[];
  usage: any;
};
const actions = [
  ["outline", "生成提纲"],
  ["draft", "生成草稿"],
  ["rewrite", "选区改写"],
  ["continue", "选区续写"],
  ["expand", "扩写"],
  ["compress", "压缩"],
  ["correct", "纠错"],
];

export default function Workbench() {
  const [user, setUser] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [token, setToken] = useState("");
  const [docs, setDocs] = useState<DocSummary[]>([]),
    [current, setCurrent] = useState<Document | null>(null),
    [content, setContent] = useState<DocNode | null>(null),
    [epoch, setEpoch] = useState(0);
  const [status, setStatus] = useState("已保存"),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [tab, setTab] = useState("ai");
  const [selection, setSelection] = useState<Selection | null>(null),
    [sources, setSources] = useState<Source[]>([]),
    [sourceText, setSourceText] = useState<any>(null);
  const [action, setAction] = useState("draft"),
    [instruction, setInstruction] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null);
  const [picking, setPicking] = useState(false),
    [inputContext, setInputContext] = useState<InputContext | null>(null);
  const [searchQuery, setSearchQuery] = useState(""),
    [searchResults, setSearchResults] = useState<any[]>([]);
  const [preview, setPreview] = useState(false),
    [settings, setSettings] = useState(false),
    [provider, setProvider] = useState({
      base_url: "https://api.openai.com/v1",
      model: "",
      key_configured: false,
      timeout: 60,
      thinking: null as boolean | null,
    });
  const [history, setHistory] = useState<any[]>([]),
    [records, setRecords] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  const editor = useRef<EditorHandle>(null),
    queue = useRef<SaveQueue | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const fail = (e: unknown) => setError((e as Error).message || String(e));
  const loadDocs = async () => setDocs(await api("/documents"));
  const openSource = async (sourceId: string, chunkId?: string) => {
    try {
      const s = await api(
        `/documents/${currentRef.current!.id}/sources/${sourceId}`,
      );
      setSourceText({ ...s, focused_chunk_id: chunkId });
      setTab("sources");
    } catch (e) {
      fail(e);
    }
  };
  useEffect(() => {
    if (sourceText?.focused_chunk_id && tab === "sources")
      document
        .getElementById(`source-chunk-${sourceText.focused_chunk_id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [sourceText, tab]);
  const refreshQueue = () => {
    const q = queue.current;
    if (q) {
      setCurrent({ ...q.base });
      setContent(q.draft);
      setStatus(
        q.blocked
          ? "版本冲突"
          : q.error
            ? "保存失败"
            : q.dirty
              ? "待保存"
              : "已保存 · 回读已校验",
      );
      if (q.error) setError(q.error);
    }
  };
  const writeRecovery = (docId: string, r: Recovery | null) => {
    const key = recoveryKey(user!, docId);
    try {
      if (r) localStorage.setItem(key, JSON.stringify(r));
      else localStorage.removeItem(key);
    } catch {
      setError(
        "浏览器本地恢复空间不足，请立即保存或下载 JSON；当前内容仍在编辑器中",
      );
    }
  };
  const save = async () => {
    if (!queue.current) return;
    setStatus("正在保存…");
    try {
      await queue.current.save();
      await loadDocs();
    } catch (e) {
      fail(e);
      throw e;
    }
  };
  const openDoc = async (identifier: string) => {
    try {
      if (timer.current) clearTimeout(timer.current);
      if (queue.current?.dirty) {
        await save();
      }
      const remote = await api<Document>(`/documents/${identifier}`);
      const q = new SaveQueue(
        remote,
        api,
        (r) => writeRecovery(identifier, r),
        refreshQueue,
      );
      queue.current = q;
      const record = localStorage.getItem(recoveryKey(user!, identifier));
      if (record) {
        await q.recover(JSON.parse(record) as Recovery);
        setWarnings(["已发现本地恢复内容，请核对后保存。"]);
      } else
        setWarnings(
          otherDrafts(user!, identifier).length
            ? [
                "发现其他标签页的本地恢复稿，可在设置中下载核对；当前正文仍来自服务端。",
              ]
            : [],
        );
      setCurrent(q.base);
      setContent(q.draft);
      setEpoch((x) => x + 1);
      setSelection(null);
      setProposal(null);
      setInputContext(null);
      setSearchResults([]);
      setSearchQuery("");
      setSourceText(null);
      setSources(await api(`/documents/${identifier}/sources`));
      refreshQueue();
    } catch (e) {
      fail(e);
    }
  };
  useEffect(() => {
    api("/session")
      .then((s) => {
        setUser(s.user);
        return loadDocs();
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (queue.current?.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    const remote = (e: StorageEvent) => {
      if (
        e.key?.startsWith(`wenyuan:${user}:${currentRef.current?.id}:`) &&
        e.newValue
      )
        setWarnings((w) => [
          ...w,
          "另一个标签页存在未保存内容；保存时将检查服务端版本。",
        ]);
    };
    window.addEventListener("storage", remote);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      window.removeEventListener("storage", remote);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user]);
  useEffect(() => {
    if (!proposal || proposal.state !== "generating" || !current) return;
    let cancelled = false;
    const handle = setInterval(() => {
      api<Proposal>(`/documents/${current.id}/proposals/${proposal.id}`)
        .then((p) => {
          if (!cancelled) {
            setProposal(p);
            if (p.document_context !== undefined && p.sources) {
              setInputContext({
                base_revision: p.base_revision,
                original: p.original || "",
                document_context: p.document_context,
                sources: p.sources,
                template: p.template,
              });
            }
          }
        })
        .catch(fail);
    }, 700);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [proposal?.id, proposal?.state, current?.id]);
  const change = (value: DocNode) => {
    queue.current!.update(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save().catch(() => {}), 700);
  };
  const transact = async (operations: Operation[], proposalId?: string) => {
    const doc = await queue.current!.transact(operations, proposalId);
    setCurrent(doc);
    setContent(doc.content);
    await loadDocs();
    return doc;
  };
  const create = async () => {
    try {
      if (queue.current?.dirty) await save();
      const doc = await api<Document>("/documents", { title: "未命名文章" });
      await loadDocs();
      await openDoc(doc.id);
    } catch (e) {
      fail(e);
    }
  };
  const upload = async (file: File | undefined, asSource = false) => {
    if (!file) return;
    setBusy(true);
    try {
      if (queue.current?.dirty) await save();
      const form = new FormData();
      form.append("file", file);
      const result = await api(
        asSource ? `/documents/${current!.id}/sources` : "/documents/import",
        form,
      );
      setWarnings(result.warnings || []);
      if (asSource) setSources(await api(`/documents/${current!.id}/sources`));
      else {
        await loadDocs();
        await openDoc(result.document.id);
        setWarnings(result.warnings || []);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async (kind: string) => {
    try {
      await save();
      const doc = queue.current!.base;
      const result = await api(
        `/documents/${doc.id}/export/${kind}?revision=${doc.revision}`,
      );
      setWarnings(result.warnings || []);
      if (!result.verified) throw new Error("导出未通过回读校验");
      download(`${doc.title}.${kind}`, result.data);
      setStatus("导出完成 · 回读已校验");
    } catch (e) {
      fail(e);
    }
  };
  const generate = async () => {
    setError("");
    try {
      await save();
      const doc = queue.current!.base;
      if (!["outline", "draft"].includes(action) && !selection)
        throw new Error("请在同一纯文本段落中选择需要修改的文字");
      const request = {
        action,
        instruction,
        base_revision: doc.revision,
        ...(!["outline", "draft"].includes(action)
          ? {
              node_id: selection!.node_id,
              start: selection!.start,
              end: selection!.end,
            }
          : undefined),
      };
      setInputContext(
        await api(`/documents/${doc.id}/writing-context`, request),
      );
      const p = await api(`/documents/${doc.id}/proposals`, request);
      setProposal(p);
    } catch (e) {
      fail(e);
    }
  };
  const inspectInput = async () => {
    try {
      await save();
      const doc = queue.current!.base;
      setInputContext(
        await api(`/documents/${doc.id}/writing-context`, {
          action,
          instruction,
          base_revision: doc.revision,
          ...(!["draft", "outline"].includes(action) && selection
            ? {
                node_id: selection.node_id,
                start: selection.start,
                end: selection.end,
              }
            : {}),
        }),
      );
    } catch (e) {
      fail(e);
    }
  };
  const useTemplate = async (t: Template) => {
    if (queue.current?.dirty) await save();
    const created = await api<Document>("/documents", { title: t.title });
    await openDoc(created.id);
    if (queue.current?.base.id !== created.id)
      throw new Error("无法打开新文稿，未应用模板");
    await transact([
      { type: "snapshot", content: t.content },
      { type: "metadata", title: t.title, layout: t.layout, template_id: t.id },
    ]);
    setEpoch((x) => x + 1);
    setTab("ai");
  };
  const accept = async () => {
    try {
      if (!proposal || proposal.state !== "ready") return;
      await save();
      if (queue.current!.base.revision !== proposal.base_revision)
        throw new Error("生成期间文档已经变化，请重新生成；未应用此提案");
      await transact(proposal.operations, proposal.id);
      setEpoch((x) => x + 1);
      setProposal({ ...proposal, state: "accepted" });
      setSelection(null);
    } catch (e) {
      fail(e);
    }
  };
  const reject = async () => {
    try {
      await api(
        `/documents/${current!.id}/proposals/${proposal!.id}`,
        undefined,
        "DELETE",
      );
      setProposal({
        ...proposal!,
        state: proposal!.state === "generating" ? "cancelled" : "rejected",
      });
    } catch (e) {
      fail(e);
    }
  };
  const showHistory = async () => {
    try {
      setTab("history");
      await save();
      setHistory(await api(`/documents/${current!.id}/history`));
      setRecords(await api(`/documents/${current!.id}/operations`));
    } catch (e) {
      fail(e);
    }
  };
  const removeDoc = async () => {
    if (!current) return;
    try {
      await save();
      const doc = queue.current!.base;
      await api(
        `/documents/${doc.id}?revision=${doc.revision}`,
        undefined,
        "DELETE",
      );
      writeRecovery(doc.id, null);
      queue.current = null;
      setCurrent(null);
      setContent(null);
      setSettings(false);
      await loadDocs();
    } catch (e) {
      fail(e);
    }
  };
  const forkRecovery = async () => {
    try {
      const q = queue.current!;
      const snapshot = {
        schema_version: 1,
        title: `${q.base.title.slice(0, 180)}（恢复副本）`,
        template_id: q.base.template_id,
        content: q.draft,
        layout: q.base.layout,
      };
      const form = new FormData();
      form.append(
        "file",
        new File([JSON.stringify(snapshot)], "恢复副本.json", {
          type: "application/json",
        }),
      );
      const result = await api("/documents/import", form);
      queue.current = null;
      await loadDocs();
      await openDoc(result.document.id);
      setError("");
    } catch (e) {
      fail(e);
    }
  };

  if (!ready)
    return (
      <main className="login">
        <p>正在打开文渊…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const result = await api("/session", { token });
              setUser(result.user);
              setToken("");
              await loadDocs();
            } catch (e) {
              fail(e);
            }
          }}
        >
          <div className="brand-mark">文</div>
          <h1>文渊</h1>
          <p>让每一篇文字，清楚而有据。</p>
          <label>
            登录令牌
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary">打开工作台 →</button>
          <small>本地管理员通过 create-user 命令生成令牌</small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  return (
    <main className="workbench">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">文</span>
          <div>
            <b>文渊</b>
            <small>写作，始于清晰</small>
          </div>
          <span className="badge">0.1</span>
        </div>
        <button className="primary new-doc" onClick={create}>
          ＋ 新建文章
        </button>
        <button className="template-entry" onClick={() => setPicking(true)}>
          从模板创建
        </button>
        <label className="import-button">
          ↑ 导入文档
          <input
            aria-label="导入文档"
            type="file"
            accept=".md,.txt,.json,.docx"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="section-label">
          我的文章 <span>{docs.length}</span>
        </div>
        <nav className="doc-list">
          {docs.map((d) => (
            <button
              key={d.id}
              className={current?.id === d.id ? "doc-item active" : "doc-item"}
              onClick={() => openDoc(d.id)}
            >
              <span>▤</span>
              <div>
                <b>{d.title}</b>
                <small>
                  r{d.revision} ·{" "}
                  {new Date(d.updated).toLocaleDateString("zh-CN")}
                </small>
              </div>
            </button>
          ))}
        </nav>
        {content && (
          <div className="outline">
            <div className="section-label">文章大纲</div>
            {outline(content).length ? (
              outline(content).map((h) => (
                <button
                  key={h.id}
                  style={{ paddingLeft: 12 + (h.level - 1) * 10 }}
                  onClick={() => editor.current?.focusNode(h.id)}
                >
                  {h.title || "未命名标题"}
                </button>
              ))
            ) : (
              <p>应用标题样式后自动生成</p>
            )}
          </div>
        )}
        <footer>
          <span>● 单机工作区 · {user}</span>
          <button
            onClick={async () => {
              try {
                if (queue.current?.dirty) await save();
                await api("/session", undefined, "DELETE");
                queue.current = null;
                setCurrent(null);
                setContent(null);
                setUser(null);
              } catch (e) {
                fail(e);
              }
            }}
          >
            退出
          </button>
        </footer>
      </aside>
      <section className="workspace">
        {process.env.NEXT_PUBLIC_WENYUAN_DEMO_MODEL === "simulated" && (
          <div className="demo-disclosure">
            合成资料演示 · 模拟模型（不作为真实模型验收）
          </div>
        )}
        <header className="workspace-header">
          <div className="breadcrumb">
            写作空间 <span>/</span> {current?.title || "开始新的创作"}
          </div>
          <div className="header-actions">
            {current && (
              <>
                <span
                  className={
                    queue.current?.error ? "save-state failed" : "save-state"
                  }
                  aria-live="polite"
                >
                  {status}
                </span>
                <button onClick={() => save().catch(() => {})}>保存</button>
                <button onClick={() => setPreview(true)}>分页预览</button>
                <button onClick={() => exportFile("docx")} className="primary">
                  导出 DOCX ↓
                </button>
                <button aria-label="文档设置" onClick={() => setSettings(true)}>
                  ⚙
                </button>
              </>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="error banner">
            <span>{error}</span>
            {queue.current?.blocked && (
              <button onClick={forkRecovery}>另存本地恢复稿</button>
            )}
            <button onClick={() => setError("")}>关闭提示</button>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="warning banner">
            <div>
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
            <button onClick={() => setWarnings([])}>收起</button>
          </div>
        )}
        {current && content ? (
          <>
            <div className="document-heading">
              <input
                aria-label="文章标题"
                key={`${current.id}:${current.title}`}
                defaultValue={current.title}
                onBlur={(e) => {
                  if (e.target.value !== queue.current!.base.title)
                    transact([
                      { type: "metadata", title: e.target.value },
                    ]).catch(fail);
                }}
              />
              <div>
                <span>原生 JSON</span>
                <span>修订 r{current.revision}</span>
                <span>{textOf(content).length.toLocaleString()} 字符</span>
              </div>
            </div>
            <div className="editor-scroll">
              <Editor
                key={`${current.id}:${epoch}`}
                ref={editor}
                content={content}
                layout={current.layout}
                onChange={change}
                onSelection={setSelection}
                onError={setError}
              />
            </div>
            <footer className="editor-footer">
              <span>修改自动保存 · Ctrl/⌘ Z 撤销</span>
              <span>
                页面 · {current.layout.width} × {current.layout.height}px
              </span>
            </footer>
          </>
        ) : (
          <div className="empty">
            <span className="empty-art">文</span>
            <p className="eyebrow">一处安静的写作空间</p>
            <h1>把想法，写成文章。</h1>
            <p>
              整理资料、勾勒提纲、认真落笔。
              <br />
              每次 AI 修改，都由你审阅和决定。
            </p>
            <button className="primary" onClick={create}>
              创建第一篇文章 →
            </button>
            <small>支持中文文章 · 公文 · 长文档</small>
          </div>
        )}
      </section>
      {current && (
        <aside className="right-panel">
          <div className="panel-tabs">
            <button
              className={tab === "ai" ? "active" : ""}
              onClick={() => setTab("ai")}
            >
              ✧ 写作助手
            </button>
            <button
              className={tab === "sources" ? "active" : ""}
              onClick={() => setTab("sources")}
            >
              资料
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={showHistory}
            >
              历史
            </button>
            <button
              className={tab === "checks" ? "active" : ""}
              onClick={() => setTab("checks")}
            >
              检查
            </button>
          </div>
          {tab === "ai" && (
            <div className="panel-body">
              <div className="assistant-intro">
                <span>✧</span>
                <h2>一起推敲，写得更好</h2>
                <p>从主题到草稿，从一句到一篇。</p>
              </div>
              <label>
                写作任务
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {actions.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                写作要求
                <textarea
                  placeholder="例如：基于资料，起草一份社区阅读活动通知，语气简明。"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </label>
              {selection && (
                <div className="selection-card">
                  <small>
                    锁定选区 · {Array.from(selection.text).length} 字符
                  </small>
                  <p>{selection.text}</p>
                </div>
              )}
              <button onClick={inspectInput} disabled={!instruction.trim()}>
                查看本轮输入
              </button>
              {inputContext && (
                <WritingContext context={inputContext} onSource={openSource} />
              )}
              <button
                className="primary"
                disabled={
                  !instruction.trim() || proposal?.state === "generating"
                }
                onClick={generate}
              >
                ✧ 生成修改建议
              </button>
              <p className="disclosure">
                文稿选区和检索片段可能发送到你配置的模型服务商。结果供人工审核；不会自动覆盖正文。
              </p>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    const result = await api("/provider");
                    if (result) setProvider(result);
                    setSettings(true);
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                配置模型服务 ↗
              </button>
              {proposal && (
                <article className="proposal">
                  <div className="proposal-title">
                    修改预览{" "}
                    <span>
                      {
                        (
                          {
                            generating: "生成中",
                            ready: "待确认",
                            accepted: "已应用",
                            rejected: "已拒绝",
                            cancelled: "已取消",
                            failed: "失败",
                            interrupted: "服务中断",
                          } as Record<string, string>
                        )[proposal.state]
                      }
                    </span>
                  </div>
                  {proposal.error && <p className="error">{proposal.error}</p>}
                  {proposal.state === "interrupted" && (
                    <p>服务已重启，未应用修改；请重新生成。</p>
                  )}
                  {proposal.suggested && (
                    <>
                      <small>原文</small>
                      <pre>{proposal.original || "（在文档末尾新增内容）"}</pre>
                      <small>建议</small>
                      <pre>{proposal.suggested}</pre>
                      <small>差异</small>
                      <div className="diff">
                        {diffChars(
                          proposal.original || "",
                          proposal.suggested,
                        ).map((p, i) =>
                          p.added ? (
                            <ins key={i}>{p.value}</ins>
                          ) : p.removed ? (
                            <del key={i}>{p.value}</del>
                          ) : (
                            <span key={i}>{p.value}</span>
                          ),
                        )}
                      </div>
                      {proposal.limitations?.map((w, i) => (
                        <p className="warning" key={i}>
                          {w}
                        </p>
                      ))}
                      {proposal.citations?.map((c, i) => (
                        <button
                          className="citation"
                          key={i}
                          onClick={async () => {
                            try {
                              await openSource(c.source_id, c.chunk_id);
                            } catch (e) {
                              fail(e);
                            }
                          }}
                        >
                          {c.name} · v{c.version.slice(0, 8)} · #{c.ordinal}
                          <q>{c.quote}</q>
                        </button>
                      ))}
                      {proposal.usage && (
                        <small>
                          服务端用量：{JSON.stringify(proposal.usage)}
                        </small>
                      )}
                    </>
                  )}
                  {proposal.state === "ready" && (
                    <div className="proposal-actions">
                      <button className="primary" onClick={accept}>
                        确认应用
                      </button>
                      <button onClick={reject}>拒绝</button>
                    </div>
                  )}
                  {proposal.state === "generating" && (
                    <button onClick={reject}>取消生成</button>
                  )}
                  {proposal.state === "accepted" && (
                    <button
                      onClick={() => {
                        if (
                          queue.current!.dirty ||
                          queue.current!.base.revision !==
                            proposal.base_revision + 1
                        ) {
                          setError(
                            "AI 应用后存在新的修改，请在版本历史中核对后恢复，避免覆盖新内容",
                          );
                          return;
                        }
                        api<any[]>(`/documents/${current.id}/history`)
                          .then((rows) => {
                            const before = rows.find(
                              (r) => r.revision === proposal.base_revision,
                            );
                            if (!before)
                              throw new Error("原版本不在最近历史中");
                            return transact([
                              {
                                type: "snapshot",
                                content: before.body.content,
                              },
                            ]);
                          })
                          .then(() => setEpoch((x) => x + 1))
                          .catch(fail);
                      }}
                    >
                      恢复应用前版本（新增修订）
                    </button>
                  )}
                </article>
              )}
            </div>
          )}
          {tab === "sources" && (
            <div className="panel-body">
              <h2>资料与依据</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setSearchResults(
                      await api(
                        `/documents/${current.id}/search?q=${encodeURIComponent(searchQuery)}`,
                      ),
                    );
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                <label>
                  检索资料
                  <input
                    aria-label="检索资料"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </label>
                <button>检索</button>
              </form>
              {searchResults.map((s) => (
                <button
                  key={s.id}
                  className="citation"
                  onClick={() => openSource(s.source_id, s.id)}
                >
                  {s.name} · 片段 #{s.ordinal}
                  <q>{s.text}</q>
                  <span>打开此片段</span>
                </button>
              ))}
              <p className="muted">
                每份资料保留原件、内容版本和实际分片。首版采用本地字面检索，不需要向量模型。
              </p>
              <label className="import-button">
                ＋ 上传资料
                <input
                  aria-label="上传资料"
                  type="file"
                  accept=".txt,.md,.docx,.json"
                  disabled={busy}
                  onChange={(e) => {
                    upload(e.target.files?.[0], true);
                    e.target.value = "";
                  }}
                />
              </label>
              {sources.map((s) => (
                <article className="source-card" key={s.id}>
                  <b>{s.name}</b>
                  <small>v{s.version.slice(0, 12)}</small>
                  <button
                    onClick={async () => {
                      try {
                        setSourceText(
                          await api(`/documents/${current.id}/sources/${s.id}`),
                        );
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    查看片段/原件
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await api(
                          `/documents/${current.id}/sources/${s.id}`,
                          undefined,
                          "DELETE",
                        );
                        setSources(
                          await api(`/documents/${current.id}/sources`),
                        );
                        setSourceText(null);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    删除资料
                  </button>
                  {s.warnings.map((w) => (
                    <small key={w}>{w}</small>
                  ))}
                </article>
              ))}
              {!sources.length && (
                <p className="muted">
                  还没有资料。可上传 examples 中的合成材料。
                </p>
              )}
              {sourceText && (
                <article>
                  <h3>{sourceText.name}</h3>
                  <button
                    onClick={() => download(sourceText.name, sourceText.data)}
                  >
                    下载原件
                  </button>
                  {sourceText.chunks.map((c: any) => (
                    <div
                      key={c.id}
                      id={`source-chunk-${c.id}`}
                      className={
                        sourceText.focused_chunk_id === c.id
                          ? "chunk focused"
                          : "chunk"
                      }
                    >
                      <small>
                        片段 #{c.ordinal} · {c.id.slice(0, 8)}
                      </small>
                      <p>{c.text}</p>
                    </div>
                  ))}
                </article>
              )}
            </div>
          )}
          {tab === "history" && (
            <div className="panel-body">
              <h2>版本与操作记录</h2>
              <p className="muted">恢复版本会创建新修订，不改写旧记录。</p>
              {history.map((h) => (
                <article className="history-card" key={h.revision}>
                  <b>修订 r{h.revision}</b>
                  <small>{new Date(h.created).toLocaleString("zh-CN")}</small>
                  <p>{textOf(h.body.content).slice(0, 100) || "空白文档"}</p>
                  <button
                    onClick={() =>
                      transact([
                        { type: "snapshot", content: h.body.content },
                        {
                          type: "metadata",
                          title: h.body.title,
                          layout: h.body.layout,
                          template_id: h.body.template_id ?? null,
                        },
                      ])
                        .then(() => setEpoch((x) => x + 1))
                        .catch(fail)
                    }
                  >
                    恢复此版本
                  </button>
                </article>
              ))}
              <h3>最近操作</h3>
              {records.map((r) => (
                <p key={r.id} className="operation">
                  <code>{r.id.slice(0, 12)}</code> · {r.state}
                </p>
              ))}
            </div>
          )}
          {tab === "checks" && (
            <ChecksPanel
              key={current.id}
              document={current}
              onSave={async () => {
                await save();
                return queue.current!.base;
              }}
              onLocate={(id) => editor.current?.focusNode(id)}
              onError={fail}
            />
          )}
        </aside>
      )}
      {preview && current && content && (
        <PagePreview
          content={content}
          layout={current.layout}
          onClose={() => setPreview(false)}
          onLocate={(identifier, offset) => {
            setPreview(false);
            setTimeout(() => editor.current?.focusNode(identifier, offset), 0);
          }}
        />
      )}
      {picking && (
        <TemplatePicker
          onUse={useTemplate}
          onClose={() => setPicking(false)}
          onError={fail}
        />
      )}
      {settings && (
        <div className="modal-overlay">
          <section className="settings-modal">
            <header>
              <h2>工作台设置</h2>
              <button onClick={() => setSettings(false)}>关闭</button>
            </header>
            <h3>模型服务</h3>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p className="disclosure">
              连接真实的 OpenAI 兼容服务；密钥仅由服务端加密保存。管理员需将模型
              origin 加入允许清单。
            </p>
            <label>
              模型地址
              <input
                aria-label="模型地址"
                value={provider.base_url}
                onChange={(e) =>
                  setProvider({ ...provider, base_url: e.target.value })
                }
              />
            </label>
            <label>
              模型名称
              <input
                aria-label="模型名称"
                value={provider.model}
                onChange={(e) =>
                  setProvider({ ...provider, model: e.target.value })
                }
              />
            </label>
            <label>
              本地模型思考（vLLM/Qwen 扩展）
              <select
                aria-label="模型思考模式"
                value={
                  provider.thinking == null
                    ? "default"
                    : provider.thinking
                      ? "on"
                      : "off"
                }
                onChange={(e) =>
                  setProvider({
                    ...provider,
                    thinking:
                      e.target.value === "default"
                        ? null
                        : e.target.value === "on",
                  })
                }
              >
                <option value="default">服务商默认</option>
                <option value="off">关闭（服务支持时可减少等待）</option>
                <option value="on">开启</option>
              </select>
              <small>仅用于支持该扩展的本地服务；其他服务请选择默认。</small>
            </label>
            <p className="notice">
              服务端密钥：
              {provider.key_configured
                ? "已配置"
                : "未配置（无密钥本地模型可用）"}
              。密钥仅通过服务端 configure-provider 命令设置，页面不接收密钥。
            </p>
            <button
              onClick={async () => {
                try {
                  setProvider(
                    await api(
                      "/provider",
                      {
                        base_url: provider.base_url,
                        model: provider.model,
                        timeout: provider.timeout,
                        thinking: provider.thinking ?? null,
                      },
                      "PUT",
                    ),
                  );
                  setStatus("模型配置已保存");
                } catch (e) {
                  fail(e);
                }
              }}
            >
              保存模型配置
            </button>
            {current && (
              <>
                <h3>页面设置</h3>
                <div className="layout-controls">
                  {(
                    [
                      "width",
                      "height",
                      "margin",
                      "font_size",
                      "line_height",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {
                        {
                          width: "页宽 px",
                          height: "页高 px",
                          margin: "四边距 px",
                          font_size: "基础字号 px",
                          line_height: "行距倍数",
                        }[k]
                      }
                      <input
                        aria-label={k}
                        type="number"
                        step="any"
                        defaultValue={current.layout[k]}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== current.layout[k])
                            transact([
                              {
                                type: "metadata",
                                layout: {
                                  ...queue.current!.base.layout,
                                  [k]: Number(e.target.value),
                                },
                              },
                            ]).catch(fail);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  字体
                  <select
                    value={current.layout.font}
                    onChange={(e) =>
                      transact([
                        {
                          type: "metadata",
                          layout: { ...current.layout, font: e.target.value },
                        },
                      ]).catch(fail)
                    }
                  >
                    <option value="serif">衬线 / 本机 Noto Serif CJK</option>
                    <option value="sans-serif">
                      无衬线 / 本机 Noto Sans CJK
                    </option>
                  </select>
                </label>
                <h3>文档文件</h3>
                <div className="button-row">
                  <button onClick={() => exportFile("json")}>
                    导出原生 JSON
                  </button>
                  <button onClick={() => exportFile("md")}>
                    导出 Markdown
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const r = await api(
                          `/documents/${current.id}/original`,
                        );
                        setWarnings(r.warnings);
                        download(r.name, r.data);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    下载导入原件
                  </button>
                </div>
                <button
                  onClick={() => {
                    const q = queue.current!;
                    download(
                      `${q.base.title}.recovery.json`,
                      btoa(
                        unescape(
                          encodeURIComponent(
                            JSON.stringify({
                              schema_version: 1,
                              title: q.base.title,
                              content: q.draft,
                              layout: q.base.layout,
                            }),
                          ),
                        ),
                      ),
                    );
                  }}
                >
                  下载本地恢复稿
                </button>
                {otherDrafts(user, current!.id).map(({ key, record }) => (
                  <button
                    key={key}
                    onClick={() => {
                      const native = {
                        schema_version: 1,
                        title: current!.title,
                        content: record.draft,
                        layout: current!.layout,
                      };
                      download(
                        `${current!.title}-其他标签页恢复稿.json`,
                        btoa(
                          unescape(encodeURIComponent(JSON.stringify(native))),
                        ),
                      );
                    }}
                  >
                    下载其他标签页恢复稿 · r{record.base_revision}
                  </button>
                ))}
                <details>
                  <summary className="danger">删除当前文章</summary>
                  <p>将同时删除修订、资料、索引、提案和保留的原件。</p>
                  <button className="danger" onClick={removeDoc}>
                    确认永久删除
                  </button>
                </details>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
