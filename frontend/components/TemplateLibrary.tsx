"use client";
import { useEffect, useState } from "react";
import { api, textOf } from "../lib/model";
import type { Template } from "./TemplatePicker";
import { Eye, LayoutTemplate, Search, UploadCloud } from "lucide-react";

export default function TemplateLibrary({
  onUse,
  onImport,
}: {
  onUse: (t: Template) => Promise<void>;
  onImport: (file: File) => Promise<void>;
}) {
  const [items, setItems] = useState<Template[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<Template | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api<Template[]>("/templates", undefined, undefined, controller.signal)
      .then(setItems)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const typeOf = (t: Template) =>
    t.id === "notice" ? "法定公文" : t.id === "article" ? "其他" : "事务文书";
  const filtered = items.filter(
    (t) =>
      (category === "全部" || typeOf(t) === category) &&
      `${t.name} ${t.guidance} ${t.sections.join(" ")}`.includes(query.trim()),
  );
  const use = async (t: Template) => {
    setBusy(true);
    setError("");
    try {
      await onUse(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="library-page template-library" aria-label="模板库内容">
      <header className="page-heading">
        <div>
          <h1>
            <LayoutTemplate size={20} />
            模板库
          </h1>
          <p>选择写作结构，预览后创建独立文稿。</p>
        </div>
        <label className="primary catalog-import">
          <UploadCloud size={16} />
          导入文档起稿
          <input
            aria-label="导入文档起稿"
            type="file"
            accept=".txt,.md,.json,.docx"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                await onImport(file);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </header>
      <div className="library-toolbar">
        <div className="catalog-search">
          <Search size={15} />
          <input
            aria-label="搜索模板"
            placeholder="搜索文种、场景或章节"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-tabs" aria-label="模板分类">
          {["全部", "法定公文", "事务文书", "其他"].map((c) => (
            <button
              key={c}
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">正在加载模板…</p>}
      <div className="template-catalog">
        {filtered.map((t) => (
          <article className="catalog-card" key={t.id}>
            <button
              className="template-paper-preview"
              aria-label={`预览${t.name}模板`}
              onClick={() => setSelected(t)}
            >
              <div className="mini-paper">
                <span className="paper-kind">原创写作模板 · {t.name}</span>
                <b>{t.title}</b>
                {t.sections.map((s) => (
                  <p key={s}>{s}</p>
                ))}
                <small>模板结构预览</small>
              </div>
            </button>
            <div className="catalog-description">
              <h2>{t.name}</h2>
              <div className="catalog-origin">
                <span className={`category-label category-${t.id}`}>
                  {typeOf(t)}
                </span>
                <small>预设</small>
              </div>
              <p>{t.guidance}</p>
              <div className="catalog-sections">
                {t.sections.slice(0, 3).map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="apply-template"
                  aria-label={`使用${t.name}模板`}
                  disabled={busy}
                  onClick={() => use(t)}
                >
                  应用模板
                </button>
                <button
                  className="icon-button"
                  aria-label="查看详情"
                  title="查看详情"
                  onClick={() => setSelected(t)}
                >
                  <Eye size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !error && !filtered.length && (
        <p className="catalog-empty">没有匹配的模板，请调整关键词或分类。</p>
      )}
      <p className="muted">
        {items.length}{" "}
        个原创预设；导入起稿会创建独立文稿，不加入模板库。不附带字体，不作为法定公文格式认证。
      </p>
      {selected && (
        <div className="modal-overlay">
          <section
            className="settings-modal template-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name}模板详情`}
          >
            <header>
              <h2>{selected.name}模板</h2>
              <button onClick={() => setSelected(null)}>关闭详情</button>
            </header>
            <p>{selected.guidance}</p>
            <div className="template-content-preview">
              {selected.content.content?.map((n, i) =>
                n.type === "heading" ? (
                  <h3 key={i}>{textOf(n)}</h3>
                ) : (
                  <p key={i}>{textOf(n) || "（空白段落）"}</p>
                ),
              )}
            </div>
            <p className="muted">
              页面 {selected.layout.width} × {selected.layout.height}px ·{" "}
              {selected.layout.font === "serif" ? "衬线字体" : "无衬线字体"} ·
              行距 {selected.layout.line_height}
            </p>
            <p className="warning">{selected.notice}</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => use(selected)}
            >
              从此模板创建文稿
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
