"use client";
import { useEffect, useState } from "react";
import { api, type DocNode, type Layout } from "../lib/model";
export type Template = {
  id: string;
  name: string;
  title: string;
  content: DocNode;
  layout: Layout;
  guidance: string;
  sections: string[];
  notice: string;
};
export default function TemplatePicker({
  onUse,
  onClose,
  onError,
}: {
  onUse: (t: Template) => Promise<void>;
  onClose: () => void;
  onError: (e: unknown) => void;
}) {
  const [items, setItems] = useState<Template[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Template[]>("/templates").then(setItems).catch(onError);
  }, []);
  return (
    <div className="modal-overlay">
      <section className="settings-modal">
        <header>
          <h2>选择写作模板</h2>
          <button onClick={onClose}>关闭</button>
        </header>
        <p className="muted">
          4 个原创写作预设，包含章节、标题样式和基础页面参数。使用后创建新文稿。
        </p>
        <div className="template-grid">
          {items.map((t) => (
            <article className="template-card" key={t.id}>
              <h3>{t.name}</h3>
              <p>{t.guidance}</p>
              <small>{t.sections.join(" / ")}</small>
              <small>
                正文 {t.layout.font_size}px · 页边距 {t.layout.margin}px
              </small>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onUse(t);
                    onClose();
                  } catch (e) {
                    onError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                使用{t.name}模板
              </button>
              <small>{t.notice}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
