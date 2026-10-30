import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { schema, identityPlugin } from "../lib/schema";
import { paginate, positionAt } from "../lib/layout";
import { paragraph, type Document, type DocNode } from "../lib/model";
import { SaveQueue, type Recovery, type Transport } from "../lib/save";

const content = (text: string): DocNode => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "paragraph01", align: "left", spacing: 8 },
      content: text ? [{ type: "text", text }] : [],
    },
  ],
});
const layout = {
  width: 400,
  height: 400,
  margin: 50,
  font: "serif" as const,
  font_size: 16,
  line_height: 1.5,
};
const document = (): Document => ({
  id: "document01",
  title: "合成",
  revision: 0,
  schema_version: 1,
  content: content("初稿"),
  layout,
  content_hash: "a".repeat(64),
  updated: "",
});

test("60 independent edits undo and redo, including emoji and combining characters", () => {
  let state = EditorState.create({
    doc: schema.nodeFromJSON(content("")),
    plugins: [history({ depth: 200 }), identityPlugin()],
  });
  const dispatch = (tr: any) => {
    state = state.applyTransaction(tr).state;
  };
  const values = Array.from({ length: 60 }, (_, i) =>
    i % 3 === 0 ? "😀" : i % 3 === 1 ? "é" : "中",
  );
  for (const value of values)
    dispatch(
      closeHistory(state.tr).insertText(value, state.doc.content.size - 1),
    );
  assert.equal(state.doc.textContent, values.join(""));
  for (let i = 0; i < 60; i++) assert.equal(undo(state, dispatch), true);
  assert.equal(state.doc.textContent, "");
  for (let i = 0; i < 60; i++) assert.equal(redo(state, dispatch), true);
  assert.equal(state.doc.textContent, values.join(""));
});

test("cross-paragraph transaction and duplicate IDs are normalized after paste", () => {
  const p = paragraph("跨段文本");
  let state = EditorState.create({
    doc: schema.nodeFromJSON({ type: "doc", content: [p, structuredClone(p)] }),
    plugins: [identityPlugin()],
  });
  state = state.applyTransaction(state.tr.insertText("新", 2)).state;
  const ids: string[] = [];
  state.doc.descendants((n) => {
    if (n.attrs.id) ids.push(n.attrs.id);
  });
  assert.equal(new Set(ids).size, ids.length);
  const selection = TextSelection.create(
    state.doc,
    2,
    state.doc.content.size - 2,
  );
  state = state.apply(state.tr.setSelection(selection).insertText("跨段替换"));
  assert.ok(state.doc.textContent.includes("跨段替换"));
});

test("layout uses grapheme boundaries and maps clicks to UTF-16 positions", () => {
  const measure = (text: string) =>
    Array.from(
      new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text),
    ).length * 10;
  const result = paginate(content("😀é中文".repeat(120)), layout, measure);
  assert.ok(result.pages.length > 1);
  const first = result.pages[0].lines[0];
  assert.equal(positionAt(first, first.x + 8, measure), 2);
  assert.equal(positionAt(first, first.x + 18, measure), 4);
  for (const page of result.pages)
    for (const line of page.lines) {
      assert.ok(line.y + line.height <= layout.height - layout.margin);
      assert.ok(!/^[\udc00-\udfff]/.test(line.runs[0]?.text || ""));
    }
});

function fakeTransport() {
  let remote = document();
  const saved = new Map<string, any>();
  let failAfterCommit = false;
  let writes = 0;
  const transport: Transport = async (path, body) => {
    if (path.startsWith("/operations/")) {
      const receipt = saved.get(path.split("/").at(-1)!);
      if (!receipt) throw Object.assign(new Error("unknown"), { status: 404 });
      return { state: "saved", result: receipt };
    }
    const tx = body as any;
    if (saved.has(tx.operation_id)) return saved.get(tx.operation_id);
    if (tx.base_revision !== remote.revision)
      throw Object.assign(new Error("conflict"), { status: 409 });
    writes++;
    const op = tx.operations[0];
    remote = {
      ...remote,
      revision: remote.revision + 1,
      content:
        op.type === "snapshot"
          ? op.content
          : op.type === "metadata"
            ? remote.content
            : content("AI 建议"),
      content_hash: String(remote.revision + 1).padStart(64, "0"),
    };
    const receipt = { state: "saved", document: structuredClone(remote) };
    saved.set(tx.operation_id, receipt);
    if (failAfterCommit) {
      failAfterCommit = false;
      throw new Error("connection dropped after commit");
    }
    return receipt;
  };
  return {
    transport,
    get remote() {
      return remote;
    },
    get writes() {
      return writes;
    },
    disconnect() {
      failAfterCommit = true;
    },
    advance() {
      remote = { ...remote, revision: remote.revision + 1 };
    },
  };
}

test("unknown save outcome queries status and never duplicates the committed operation", async () => {
  const fake = fakeTransport();
  let record: Recovery | null = null;
  const queue = new SaveQueue(
    document(),
    fake.transport,
    (r) => {
      record = r;
    },
    () => {},
  );
  queue.update(content("本地恢复稿"));
  fake.disconnect();
  await assert.rejects(queue.save());
  assert.ok((record as Recovery | null)?.pending);
  await queue.save();
  assert.equal(fake.writes, 1);
  assert.equal(queue.dirty, false);
  assert.equal(record, null);
});

test("revision conflict keeps the local draft intact and blocks further writes", async () => {
  const fake = fakeTransport();
  let record: Recovery | null = null;
  const queue = new SaveQueue(
    document(),
    fake.transport,
    (r) => {
      record = r;
    },
    () => {},
  );
  queue.update(content("绝不能丢"));
  fake.advance();
  await assert.rejects(queue.save());
  assert.equal(queue.blocked, true);
  assert.equal(queue.draft.content![0].content![0].text, "绝不能丢");
  assert.ok(record);
  await assert.rejects(queue.save());
  assert.equal(fake.writes, 0);
});

test("refresh recovery reconciles a completed AI operation instead of overwriting it", async () => {
  const fake = fakeTransport();
  let record: Recovery | null = null;
  const queue = new SaveQueue(
    document(),
    fake.transport,
    (r) => {
      record = r;
    },
    () => {},
  );
  fake.disconnect();
  await assert.rejects(
    queue.transact([{ type: "append_blocks", blocks: [] }], "proposal01"),
  );
  const refreshed = new SaveQueue(
    fake.remote,
    fake.transport,
    () => {},
    () => {},
  );
  await refreshed.recover(record!);
  assert.equal(refreshed.dirty, false);
  assert.equal(refreshed.draft.content![0].content![0].text, "AI 建议");
  await refreshed.save();
  assert.equal(fake.writes, 1);
});

test("edits made during a snapshot save are serialized into the next revision", async () => {
  const fake = fakeTransport();
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  let first = true;
  const transport: Transport = async (...args) => {
    if (!args[0].startsWith("/operations/") && first) {
      first = false;
      await wait;
    }
    return fake.transport(...args);
  };
  const queue = new SaveQueue(
    document(),
    transport,
    () => {},
    () => {},
  );
  queue.update(content("第一版"));
  const saving = queue.save();
  queue.update(content("第二版"));
  release();
  await saving;
  assert.equal(fake.remote.content.content![0].content![0].text, "第二版");
  assert.equal(fake.writes, 2);
});

test("metadata commits serialize with automatic saves while typing continues", async () => {
  const fake = fakeTransport();
  let release!: () => void, start!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let first = true;
  const transport: Transport = async (...args) => {
    if (!args[0].startsWith("/operations/") && first) {
      first = false;
      start();
      await gate;
    }
    return fake.transport(...args);
  };
  const queue = new SaveQueue(
    document(),
    transport,
    () => {},
    () => {},
  );
  const metadata = queue.transact([{ type: "metadata", title: "新的标题" }]);
  await started;
  queue.update(content("标题保存期间继续输入"));
  const saving = queue.save();
  release();
  await Promise.all([metadata, saving]);
  assert.equal(fake.remote.revision, 2);
  assert.equal(queue.blocked, false);
  assert.equal(queue.dirty, false);
  assert.equal(
    fake.remote.content.content![0].content![0].text,
    "标题保存期间继续输入",
  );
});

test("an unreceived metadata operation survives refresh even if body text is unchanged", async () => {
  const fake = fakeTransport();
  const queue = new SaveQueue(
    document(),
    fake.transport,
    () => {},
    () => {},
  );
  const pending = {
    operation_id: "pending-metadata",
    base_revision: 0,
    expected_hash: "a".repeat(64),
    operations: [{ type: "metadata", title: "应重试的标题" }],
  };
  await queue.recover({
    base_revision: 0,
    draft: document().content,
    pending,
    sent_draft: document().content,
  });
  assert.equal(queue.dirty, true);
  assert.equal(queue.pending?.operation_id, "pending-metadata");
  await queue.save();
  assert.equal(fake.writes, 1);
});
