"use client";
export type InputContext = {
  base_revision: number;
  original: string;
  document_context: string;
  template?: { name: string; guidance: string } | null;
  sources: {
    id: string;
    source_id: string;
    name: string;
    version: string;
    ordinal: number;
    text: string;
  }[];
};
export default function WritingContext({
  context,
  onSource,
}: {
  context: InputContext;
  onSource: (id: string, chunk: string) => void;
}) {
  return (
    <details className="input-context" open>
      <summary>发送给模型的内容 · 第 {context.base_revision} 版</summary>
      <small>包括选中文字、正文背景和以下参考资料。</small>
      {context.template && (
        <p>
          模板：{context.template.name} · {context.template.guidance}
        </p>
      )}
      <details>
        <summary>
          实际选区{context.original ? "" : "（提纲/草稿无选区）"}
        </summary>
        <pre>{context.original || "将在文档末尾新增内容"}</pre>
      </details>
      <details>
        <summary>正文背景</summary>
        <pre>{context.document_context || "空白正文"}</pre>
      </details>
      <b>检索资料 {context.sources.length} 段</b>
      {context.sources.length ? (
        context.sources.map((s) => (
          <button
            className="citation"
            key={s.id}
            onClick={() => onSource(s.source_id, s.id)}
          >
            {s.name} · v{s.version.slice(0, 8)} · #{s.ordinal}
            <q>{s.text}</q>
          </button>
        ))
      ) : (
        <p className="warning">
          没有检索到可用依据，生成内容需要人工核实，不能当作有来源的事实。
        </p>
      )}
    </details>
  );
}
