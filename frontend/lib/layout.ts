import type { DocNode, Layout } from "./model";

export type Style = {
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
};
export type Run = {
  text: string;
  x: number;
  width: number;
  style: Style;
  start: number;
  end: number;
};
export type Line = {
  node_id: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
  runs: Run[];
  image?: { src: string; width: number; height: number };
  table?: { cells: { text: string; x: number; width: number }[] };
};
export type Page = { lines: Line[] };
export type Measure = (text: string, style: Style) => number;

// Positions refer to UTF-16 offsets inside stable paragraph IDs. Layout never mutates JSON.
// Scope: horizontal text, greedy grapheme wrapping, fixed line-height, inline images and atomic tables.
export function paginate(
  root: DocNode,
  config: Layout,
  measure: Measure,
): { pages: Page[]; warnings: string[] } {
  const pages: Page[] = [{ lines: [] }],
    warnings = new Set<string>();
  const available = config.width - config.margin * 2,
    bottom = config.height - config.margin;
  let y = config.margin;
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
  const add = (line: Line) => {
    if (line.height > bottom - config.margin) {
      warnings.add(
        "存在高于一页的对象；首版不拆分跨页表格或大图，预览可能溢出",
      );
    }
    if (y + line.height > bottom && pages.at(-1)!.lines.length) {
      pages.push({ lines: [] });
      y = config.margin;
    }
    line.y = y;
    pages.at(-1)!.lines.push(line);
    y += line.height;
  };
  function block(n: DocNode, prefix = "") {
    if (n.type === "paragraph" || n.type === "heading") {
      const a = n.attrs!,
        heading = n.type === "heading";
      const baseSize = heading
        ? config.font_size * (1.7 - (a.level || 1) * 0.12)
        : config.font_size;
      let runs: Run[] = [],
        x = 0,
        offset = 0,
        start = 0,
        height = baseSize * config.line_height;
      const flush = () => {
        const free = available - x,
          align =
            a.align === "center" ? free / 2 : a.align === "right" ? free : 0;
        if (a.align === "justify")
          warnings.add("两端对齐预览暂按左对齐；导出保留对齐属性");
        add({
          node_id: a.id,
          start,
          end: offset,
          x: config.margin + Math.max(0, align),
          y: 0,
          width: x,
          height,
          runs,
        });
        runs = [];
        x = 0;
        start = offset;
        height = baseSize * config.line_height;
      };
      const write = (text: string, style: Style, tracked = true) => {
        for (const s of segmenter.segment(text)) {
          if (s.segment === "\n") {
            offset += tracked ? s.segment.length : 0;
            flush();
            continue;
          }
          let last = runs.at(-1);
          const same =
            last && JSON.stringify(last.style) === JSON.stringify(style);
          let width = same
            ? measure(last!.text + s.segment, style) - last!.width
            : measure(s.segment, style);
          if (x + width > available && runs.length) {
            flush();
            last = undefined;
            width = measure(s.segment, style);
          }
          const end = offset + (tracked ? s.segment.length : 0);
          if (last && JSON.stringify(last.style) === JSON.stringify(style)) {
            last.text += s.segment;
            last.width += width;
            last.end = end;
          } else
            runs.push({ text: s.segment, x, width, style, start: offset, end });
          x += width;
          offset = end;
          height = Math.max(height, style.size * config.line_height);
        }
      };
      const defaultStyle = {
        size: baseSize,
        bold: heading,
        italic: false,
        color: "#202020",
      };
      if (prefix) write(prefix, defaultStyle, false);
      for (const c of n.content || []) {
        if (c.type === "hard_break") {
          offset++;
          flush();
        } else if (c.type === "image") {
          if (runs.length) flush();
          const ratio = Math.min(1, available / (c.attrs!.width || 160));
          add({
            node_id: a.id,
            start: offset,
            end: offset + 1,
            x: config.margin,
            y: 0,
            width: c.attrs!.width * ratio,
            height: c.attrs!.height * ratio,
            runs: [],
            image: {
              src: c.attrs!.src,
              width: c.attrs!.width * ratio,
              height: c.attrs!.height * ratio,
            },
          });
          offset++;
          start = offset;
        } else {
          const style = { ...defaultStyle };
          for (const m of c.marks || []) {
            if (m.type === "bold") style.bold = true;
            if (m.type === "italic") style.italic = true;
            if (m.type === "style") {
              style.size = m.attrs!.size;
              style.color = m.attrs!.color;
            }
          }
          write(c.text || "", style);
        }
      }
      if (runs.length || !(n.content || []).length) flush();
      y += a.spacing ?? 8;
    } else if (n.type === "ordered_list" || n.type === "bullet_list") {
      (n.content || []).forEach((item, i) =>
        (item.content || []).forEach((c, j) =>
          block(
            c,
            j === 0
              ? n.type === "bullet_list"
                ? "• "
                : `${(n.attrs?.order || 1) + i}. `
              : "",
          ),
        ),
      );
    } else if (n.type === "table") {
      const cols = n.content![0].content!.length,
        colWidth = available / cols;
      const tableLines: Line[] = [];
      for (const row of n.content || []) {
        let rowHeight = config.font_size * config.line_height + 16;
        const cells = row.content!.map((cell, i) => {
          const txt = (cell.content || [])
            .map((p) => (p.content || []).map((c) => c.text || "").join(""))
            .join("\n");
          const width = measure(txt, {
            size: config.font_size,
            bold: cell.type === "table_header",
            italic: false,
            color: "#202020",
          });
          rowHeight = Math.max(
            rowHeight,
            Math.ceil(width / Math.max(1, colWidth - 16)) *
              config.font_size *
              config.line_height +
              16,
          );
          return { text: txt, x: i * colWidth, width: colWidth };
        });
        tableLines.push({
          node_id: n.attrs!.id,
          start: 0,
          end: 0,
          x: config.margin,
          y: 0,
          width: available,
          height: rowHeight,
          runs: [],
          table: { cells },
        });
      }
      const total = tableLines.reduce((a, l) => a + l.height, 0);
      if (y + total > bottom && pages.at(-1)!.lines.length) {
        pages.push({ lines: [] });
        y = config.margin;
      }
      if (total > bottom - config.margin)
        warnings.add("表格超过一页；首版不支持跨页表格，建议拆分后核对");
      for (const line of tableLines) {
        line.y = y;
        pages.at(-1)!.lines.push(line);
        y += line.height;
      }
      y += 8;
    } else for (const c of n.content || []) block(c);
  }
  block(root);
  return { pages, warnings: [...warnings] };
}

export function canvasMeasure(
  context: CanvasRenderingContext2D,
  font: string,
): Measure {
  return (text, style) => {
    context.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${style.size}px ${font === "serif" ? '"Noto Serif CJK SC", serif' : '"Noto Sans CJK SC", sans-serif'}`;
    return context.measureText(text).width;
  };
}

export function positionAt(line: Line, x: number, measure: Measure): number {
  const local = Math.max(0, x - line.x);
  for (const run of line.runs) {
    if (local <= run.x + run.width) {
      let previous = 0;
      for (const s of new Intl.Segmenter("zh-CN", {
        granularity: "grapheme",
      }).segment(run.text)) {
        const current = measure(
          run.text.slice(0, s.index + s.segment.length),
          run.style,
        );
        if (local - run.x < (previous + current) / 2)
          return run.start + s.index;
        previous = current;
      }
      return run.end;
    }
  }
  return line.end;
}
