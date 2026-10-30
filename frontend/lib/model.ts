export type DocNode = {
  type: string;
  attrs?: Record<string, any>;
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
  content?: DocNode[];
};
export type Layout = {
  width: number;
  height: number;
  margin: number;
  font: "serif" | "sans-serif";
  font_size: number;
  line_height: number;
};
export type Document = {
  id: string;
  title: string;
  revision: number;
  schema_version: 1;
  content: DocNode;
  layout: Layout;
  content_hash: string;
  updated: string;
};
export type Selection = {
  node_id: string;
  start: number;
  end: number;
  text: string;
};
export type Operation = Record<string, unknown>;
export const id = () => crypto.randomUUID().replaceAll("-", "");
export const paragraph = (text = ""): DocNode => ({
  type: "paragraph",
  attrs: { id: id(), align: "left", spacing: 8 },
  content: text ? [{ type: "text", text }] : [],
});
export function textOf(n: DocNode): string {
  return n.type === "text"
    ? n.text || ""
    : n.type === "hard_break"
      ? "\n"
      : n.type === "image"
        ? "\ufffc"
        : (n.content || [])
            .map(textOf)
            .join(["paragraph", "heading"].includes(n.type) ? "" : "\n");
}
export function outline(
  n: DocNode,
): { id: string; title: string; level: number }[] {
  return [
    ...(n.type === "heading"
      ? [{ id: n.attrs!.id, title: textOf(n), level: n.attrs!.level }]
      : []),
    ...(n.content || []).flatMap(outline),
  ];
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body && !form ? { "Content-Type": "application/json" } : undefined,
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof data.error === "string"
          ? data.error
          : typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail || data),
      ),
      { status: response.status },
    );
  return data;
}
export function download(
  name: string,
  data: string,
  mime = "application/octet-stream",
) {
  const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
    type: mime,
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
