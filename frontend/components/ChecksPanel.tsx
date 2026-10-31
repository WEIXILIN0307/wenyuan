"use client";
import { useState } from "react";
import { api, type Document } from "../lib/model";
type Report = {
  revision: number;
  issues: {
    code: string;
    message: string;
    evidence: string;
    node_id?: string;
  }[];
  checked: string[];
  limitations: string;
};
export default function ChecksPanel({
  document,
  onSave,
  onLocate,
  onError,
}: {
  document: Document;
  onSave: () => Promise<Document>;
  onLocate: (id: string) => void;
  onError: (e: unknown) => void;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <div className="panel-body">
      <h2>文稿检查</h2>
      <p className="muted">核对日期、必要章节和引用来源。</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const saved = await onSave();
            setReport(
              await api(
                `/documents/${saved.id}/checks?revision=${saved.revision}`,
              ),
            );
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        检查已保存文稿
      </button>
      {report && (
        <>
          <p className="muted">
            检查修订 r{report.revision}
            {document.revision !== report.revision
              ? " · 内容已变化，请重新检查"
              : ""}
          </p>
          {report.issues.length === 0 ? (
            <p className="notice">未发现规则内的问题。请继续核对事实和表述。</p>
          ) : (
            report.issues.map((i, n) => (
              <article className="check-card" key={n}>
                <b>{i.message}</b>
                <p>{i.evidence}</p>
                {i.node_id && (
                  <button onClick={() => onLocate(i.node_id!)}>定位原文</button>
                )}
              </article>
            ))
          )}
          <details>
            <summary>检查范围与限制</summary>
            <p>{report.checked.join("、")}</p>
            <p>{report.limitations}</p>
          </details>
        </>
      )}
    </div>
  );
}
