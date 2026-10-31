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
      <section className="settings-modal template-picker">
        <header>
          <h2>选择写作模板</h2>
          <button onClick={onClose}>关闭</button>
        </header>
        <p className="muted">选择模板以创建新文稿，章节与内容均可修改。</p>
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
            </article>
          ))}
        </div>
        <p className="template-notice">
          项目原创示例，不附带字体，不作为法定公文格式认证。
        </p>
      </section>
    </div>
  );
}
