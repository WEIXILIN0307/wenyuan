"use client";
import { useEffect, useState } from "react";
import { api, textOf } from "../lib/model";
import type { Template } from "./TemplatePicker";

export default function TemplateLibrary({
  onUse,
}: {
  onUse: (t: Template) => Promise<void>;
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
  const typeOf = (t: Template) => (t.id === "article" ? "文章" : "公文");
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
          <h1>模板库</h1>
          <p>选择写作结构，预览后创建独立文稿。</p>
        </div>
        <span className="muted">{items.length} 个原创模板</span>
      </header>
      <div className="library-toolbar">
        <input
          aria-label="搜索模板"
          placeholder="搜索文种、场景或章节"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-tabs" aria-label="模板分类">
          {["全部", "公文", "文章"].map((c) => (
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
                <b>{t.title}</b>
                {t.sections.map((s) => (
                  <p key={s}>{s}</p>
                ))}
                <small>模板结构预览</small>
              </div>
            </button>
            <div className="catalog-description">
              <span className="category-label">{typeOf(t)}</span>
              <h2>{t.name}</h2>
              <p>{t.guidance}</p>
              <small>
                {t.layout.font_size}px 正文 · {t.layout.margin}px 页边距
              </small>
              <div className="button-row">
                <button onClick={() => setSelected(t)}>查看详情</button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => use(t)}
                >
                  使用{t.name}模板
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
        模板文字为本项目原创示例；不附带字体，不作为法定公文格式认证。
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
