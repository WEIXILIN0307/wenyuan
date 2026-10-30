import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { id } from "./model";

const identity = { id: { default: null } };
const blockAttrs = {
  ...identity,
  align: { default: "left" },
  spacing: { default: 8 },
};
const attrs = (dom: HTMLElement) => ({
  id: null,
  align: ["left", "center", "right", "justify"].includes(dom.style.textAlign)
    ? dom.style.textAlign
    : "left",
  spacing: 8,
});
const blockDOM = (node: any, tag: string): any => [
  tag,
  {
    "data-node-id": node.attrs.id,
    style: `text-align:${node.attrs.align};margin:0 0 ${node.attrs.spacing}px`,
  },
  0,
];
const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  text: { group: "inline" },
  paragraph: {
    group: "block",
    content: "inline*",
    attrs: blockAttrs,
    parseDOM: [{ tag: "p", getAttrs: (d) => attrs(d as HTMLElement) }],
    toDOM: (n) => blockDOM(n, "p"),
  },
  heading: {
    group: "block",
    content: "inline*",
    defining: true,
    attrs: { ...blockAttrs, level: { default: 1 } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (d: HTMLElement) => ({ ...attrs(d), level }),
    })),
    toDOM: (n) => blockDOM(n, `h${n.attrs.level}`),
  },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
  image: {
    inline: true,
    group: "inline",
    draggable: true,
    attrs: {
      ...identity,
      src: {},
      alt: { default: "" },
      width: { default: 160 },
      height: { default: 160 },
    },
    parseDOM: [
      {
        tag: 'img[src^="data:image/"]',
        getAttrs: (d) => {
          const img = d as HTMLImageElement;
          return {
            src: img.src,
            alt: img.alt,
            width: Math.min(1600, img.width || 160),
            height: Math.min(1600, img.height || 160),
          };
        },
      },
    ],
    toDOM: (n) => ["img", { ...n.attrs, "data-node-id": n.attrs.id }],
  },
  bullet_list: {
    group: "block",
    content: "list_item+",
    attrs: identity,
    parseDOM: [{ tag: "ul" }],
    toDOM: () => ["ul", 0],
  },
  ordered_list: {
    group: "block",
    content: "list_item+",
    attrs: { ...identity, order: { default: 1 } },
    parseDOM: [
      {
        tag: "ol",
        getAttrs: (d) => ({
          order: Number((d as HTMLElement).getAttribute("start") || 1),
        }),
      },
    ],
    toDOM: (n) => ["ol", { start: n.attrs.order }, 0],
  },
  list_item: {
    content:
      "(paragraph|heading) (paragraph|heading|bullet_list|ordered_list)*",
    defining: true,
    attrs: identity,
    parseDOM: [{ tag: "li" }],
    toDOM: () => ["li", 0],
  },
  table: {
    group: "block",
    content: "table_row+",
    tableRole: "table",
    isolating: true,
    attrs: identity,
    parseDOM: [{ tag: "table" }],
    toDOM: () => ["table", ["tbody", 0]],
  },
  table_row: {
    content: "(table_cell|table_header)+",
    tableRole: "row",
    attrs: identity,
    parseDOM: [{ tag: "tr" }],
    toDOM: () => ["tr", 0],
  },
};
for (const [kind, tag] of [
  ["table_cell", "td"],
  ["table_header", "th"],
])
  nodes[kind] = {
    content: "paragraph+",
    tableRole: kind === "table_cell" ? "cell" : "header_cell",
    isolating: true,
    attrs: {
      ...identity,
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null },
    },
    parseDOM: [{ tag }],
    toDOM: () => [tag, 0],
  };
const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }, { style: "font-weight=bold" }],
    toDOM: () => ["strong", 0],
  },
  italic: {
    parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    toDOM: () => ["em", 0],
  },
  link: {
    inclusive: false,
    attrs: { href: {} },
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (d) => {
          const href = (d as HTMLAnchorElement).getAttribute("href") || "";
          return /^(https?:|mailto:)/i.test(href) ? { href } : false;
        },
      },
    ],
    toDOM: (n) => [
      "a",
      { href: n.attrs.href, rel: "noopener noreferrer", target: "_blank" },
      0,
    ],
  },
  style: {
    attrs: { color: { default: "#202020" }, size: { default: 16 } },
    parseDOM: [
      {
        tag: "span[style]",
        getAttrs: (d) => {
          const el = d as HTMLElement;
          const rgb = el.style.color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
          return {
            size: Math.max(
              8,
              Math.min(96, parseFloat(el.style.fontSize) || 16),
            ),
            color: rgb
              ? "#" +
                rgb
                  .slice(1)
                  .map((v) => Number(v).toString(16).padStart(2, "0"))
                  .join("")
              : "#202020",
          };
        },
      },
    ],
    toDOM: (n) => [
      "span",
      { style: `color:${n.attrs.color};font-size:${n.attrs.size}px` },
      0,
    ],
  },
};
export const schema = new Schema({ nodes, marks });
export function identityPlugin() {
  return new Plugin({
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((t) => t.docChanged)) return null;
      const seen = new Set<string>(),
        tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.isInline && !node.isText && node.marks.length)
          tr.setNodeMarkup(pos, undefined, node.attrs, []);
        if (node.isText || node.type.name === "hard_break") return;
        let identifier = node.attrs.id;
        if (!identifier || seen.has(identifier)) {
          identifier = id();
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: identifier });
        }
        seen.add(identifier);
      });
      return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
    },
  });
}
