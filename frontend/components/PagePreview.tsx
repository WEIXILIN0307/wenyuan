"use client";
import { useEffect, useState } from "react";
import {
  canvasMeasure,
  paginate,
  positionAt,
  type Line,
  type Page,
} from "../lib/layout";
import type { DocNode, Layout } from "../lib/model";
export default function PagePreview({
  content,
  layout,
  onClose,
  onLocate,
}: {
  content: DocNode;
  layout: Layout;
  onClose: () => void;
  onLocate: (id: string, offset: number) => void;
}) {
  const [result, setResult] = useState<{ pages: Page[]; warnings: string[] }>({
    pages: [],
    warnings: [],
  });
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (!alive) return;
      const context = document.createElement("canvas").getContext("2d")!;
      setResult(paginate(content, layout, canvasMeasure(context, layout.font)));
    });
    return () => {
      alive = false;
    };
  }, [content, layout]);
  const locate = (line: Line, e: React.MouseEvent) => {
    if (line.table) return;
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    const context = document.createElement("canvas").getContext("2d")!;
    onLocate(
      line.node_id,
      positionAt(
        line,
        e.clientX - box.left,
        canvasMeasure(context, layout.font),
      ),
    );
  };
  return (
    <div className="modal-overlay">
      <section className="preview-modal">
        <header>
          <div>
            <b>分页预览</b>
            <small>
              测量布局 · {result.pages.length} 页 · 点击文字返回编辑位置
            </small>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>
        <p className="notice">
          首版：横排文本、按字素换行、固定行高、行内图片与整表分页。字体替换、禁则、两端对齐、复杂表格与
          Word 结果可能不同。
        </p>
        {result.warnings.map((w) => (
          <p className="warning" key={w}>
            {w}
          </p>
        ))}
        <div className="pages">
          {result.pages.map((page, i) => (
            <div
              className="preview-page"
              key={i}
              style={{
                width: layout.width,
                height: layout.height,
                fontFamily:
                  layout.font === "serif"
                    ? '"Noto Serif CJK SC",serif'
                    : '"Noto Sans CJK SC",sans-serif',
              }}
            >
              {page.lines.map((line, j) => (
                <div
                  key={j}
                  className="preview-line"
                  onClick={(e) => locate(line, e)}
                  style={{
                    left: line.x,
                    top: line.y,
                    height: line.height,
                    width: line.width,
                  }}
                >
                  {line.image ? (
                    <img
                      alt="文档图片"
                      src={line.image.src}
                      width={line.image.width}
                      height={line.image.height}
                    />
                  ) : line.table ? (
                    line.table.cells.map((c, k) => (
                      <div
                        key={k}
                        className="preview-cell"
                        style={{
                          left: c.x,
                          width: c.width,
                          height: line.height,
                          fontSize: layout.font_size,
                          lineHeight: layout.line_height,
                        }}
                      >
                        {c.text}
                      </div>
                    ))
                  ) : (
                    line.runs.map((r, k) => (
                      <span
                        key={k}
                        style={{
                          position: "absolute",
                          left: r.x,
                          fontSize: r.style.size,
                          fontWeight: r.style.bold ? 700 : 400,
                          fontStyle: r.style.italic ? "italic" : "normal",
                          color: r.style.color,
                          lineHeight: `${line.height}px`,
                          whiteSpace: "pre",
                        }}
                      >
                        {r.text}
                      </span>
                    ))
                  )}
                </div>
              ))}
              <span className="page-number">{i + 1}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
