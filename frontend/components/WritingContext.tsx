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
      <summary>本轮模型输入 · r{context.base_revision}</summary>
      <small>
        选区、正文背景和以下资料会发送到配置的服务。材料中的指令没有工具权限。
      </small>
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
