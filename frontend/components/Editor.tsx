"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, toggleMark, setBlockType } from "prosemirror-commands";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import {
  tableEditing,
  goToNextCell,
  addRowAfter,
  addColumnAfter,
  deleteTable,
} from "prosemirror-tables";
import { schema, identityPlugin } from "../lib/schema";
import {
  api,
  id,
  type DocNode,
  type Layout,
  type Selection,
} from "../lib/model";

export type EditorHandle = {
  replace: (content: DocNode) => void;
  focusNode: (id: string, offset?: number) => void;
  undo: () => void;
  get: () => DocNode;
};
type Props = {
  content: DocNode;
  layout: Layout;
  onChange: (content: DocNode) => void;
  onSelection: (s: Selection | null) => void;
  onError: (s: string) => void;
};
const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    callbacks = useRef(props);
  callbacks.current = props;
  const [link, setLink] = useState("");
  const run = (command: Command) => {
    const v = view.current;
    if (v) {
      command(v.state, v.dispatch, v);
      v.focus();
    }
  };
  useImperativeHandle(ref, () => ({
    get: () => view.current!.state.doc.toJSON(),
    undo: () => run(undo),
    replace: (content) => {
      const v = view.current!;
      const parsed = schema.nodeFromJSON(content);
      v.dispatch(
        closeHistory(v.state.tr).replaceWith(
          0,
          v.state.doc.content.size,
          parsed.content,
        ),
      );
    },
    focusNode: (identifier, offset = 0) => {
      const v = view.current!;
      v.state.doc.descendants((n, pos) => {
        if (n.attrs.id === identifier) {
          const position = Math.min(v.state.doc.content.size, pos + 1 + offset);
          v.dispatch(
            v.state.tr
              .setSelection(TextSelection.near(v.state.doc.resolve(position)))
              .scrollIntoView(),
          );
          v.focus();
          return false;
        }
      });
    },
  }));
  useEffect(() => {
    const v = new EditorView(host.current!, {
      state: EditorState.create({
        doc: schema.nodeFromJSON(props.content),
        plugins: [
          identityPlugin(),
          history({ depth: 200 }),
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
            "Mod-b": toggleMark(schema.marks.bold),
            "Mod-i": toggleMark(schema.marks.italic),
            Enter: splitListItem(schema.nodes.list_item),
            Tab: goToNextCell(1),
            "Shift-Tab": goToNextCell(-1),
            "Mod-]": sinkListItem(schema.nodes.list_item),
            "Mod-[": liftListItem(schema.nodes.list_item),
          }),
          keymap(baseKeymap),
          tableEditing(),
        ],
      }),
      attributes: {
        "aria-label": "文章正文",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      },
      dispatchTransaction(tr) {
        const result = v.state.applyTransaction(tr);
        v.updateState(result.state);
        if (result.transactions.some((t) => t.docChanged))
          callbacks.current.onChange(v.state.doc.toJSON());
        const { selection } = v.state;
        if (
          !selection.empty &&
          selection.$from.sameParent(selection.$to) &&
          selection.$from.parent.isTextblock
        ) {
          callbacks.current.onSelection({
            node_id: selection.$from.parent.attrs.id,
            start: selection.$from.parentOffset,
            end: selection.$to.parentOffset,
            text: v.state.doc.textBetween(selection.from, selection.to, "\n"),
          });
        } else if (tr.docChanged || tr.selectionSet)
          callbacks.current.onSelection(null);
      },
      handleDOMEvents: {
        drop: (_v, event) => {
          if (event.dataTransfer?.files.length) {
            callbacks.current.onError(
              "请使用图片按钮上传；不直接读取拖入的外部文件",
            );
            return true;
          }
          return false;
        },
      },
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []); // Canonical server replacement is explicit through the transaction adapter.
  const blockAttr = (name: string, value: any) => {
    const v = view.current!;
    let tr = v.state.tr;
    v.state.doc.nodesBetween(
      v.state.selection.from,
      v.state.selection.to,
      (n, pos) => {
        if (n.isTextblock)
          tr = tr.setNodeMarkup(pos, undefined, { ...n.attrs, [name]: value });
      },
    );
    v.dispatch(tr);
    v.focus();
  };
  const style = (attrs: Record<string, any>) => {
    const v = view.current!,
      m = schema.marks.style;
    const old = (v.state.storedMarks || v.state.selection.$from.marks()).find(
      (x) => x.type === m,
    );
    const mark = m.create({ ...old?.attrs, ...attrs });
    v.dispatch(
      v.state.selection.empty
        ? v.state.tr.addStoredMark(mark)
        : v.state.tr.addMark(
            v.state.selection.from,
            v.state.selection.to,
            mark,
          ),
    );
    v.focus();
  };
  const table = () => {
    const rows = [0, 1, 2].map((_, r) =>
      schema.nodes.table_row.create(
        { id: id() },
        [0, 1, 2].map(() =>
          schema.nodes[r === 0 ? "table_header" : "table_cell"].create(
            { id: id() },
            schema.nodes.paragraph.create({ id: id() }),
          ),
        ),
      ),
    );
    const v = view.current!;
    v.dispatch(
      v.state.tr
        .replaceSelectionWith(schema.nodes.table.create({ id: id() }, rows))
        .scrollIntoView(),
    );
    v.focus();
  };
  const image = async (file?: File) => {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ src: string; width: number; height: number }>(
        "/images",
        form,
      );
      const scale = Math.min(1, 400 / result.width, 400 / result.height);
      const v = view.current!;
      v.dispatch(
        v.state.tr.replaceSelectionWith(
          schema.nodes.image.create({
            id: id(),
            src: result.src,
            alt: file.name,
            width: Math.max(1, result.width * scale),
            height: Math.max(1, result.height * scale),
          }),
          false,
        ),
      );
      v.focus();
    } catch (e) {
      props.onError((e as Error).message);
    }
  };
  return (
    <div className="editor-shell">
      <div
        className="toolbar"
        aria-label="格式工具栏"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).tagName === "BUTTON")
            e.preventDefault();
        }}
      >
        <button title="撤销 Ctrl+Z" aria-label="撤销" onClick={() => run(undo)}>
          ↶
        </button>
        <button
          title="重做 Ctrl+Shift+Z"
          aria-label="重做"
          onClick={() => run(redo)}
        >
          ↷
        </button>
        <i />
        <select
          aria-label="段落样式"
          defaultValue="paragraph"
          onChange={(e) => {
            const level = Number(e.target.value);
            run(
              setBlockType(
                level ? schema.nodes.heading : schema.nodes.paragraph,
                level ? { level } : {},
              ),
            );
          }}
        >
          <option value="paragraph">正文</option>
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <option key={v} value={v}>
              标题 {v}
            </option>
          ))}
        </select>
        <button
          aria-label="粗体"
          onClick={() => run(toggleMark(schema.marks.bold))}
        >
          <b>B</b>
        </button>
        <button
          aria-label="斜体"
          onClick={() => run(toggleMark(schema.marks.italic))}
        >
          <em>I</em>
        </button>
        <select
          aria-label="字号"
          defaultValue="16"
          onChange={(e) => style({ size: Number(e.target.value) })}
        >
          {[12, 14, 16, 18, 20, 24, 32, 48].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          aria-label="文字颜色"
          type="color"
          defaultValue="#202020"
          onChange={(e) => style({ color: e.target.value })}
        />
        <i />
        <select
          aria-label="对齐"
          onChange={(e) => blockAttr("align", e.target.value)}
        >
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
          <option value="justify">两端对齐</option>
        </select>
        <select
          aria-label="段后间距"
          defaultValue="8"
          onChange={(e) => blockAttr("spacing", Number(e.target.value))}
        >
          {[0, 4, 8, 16, 24].map((x) => (
            <option key={x} value={x}>
              段后 {x}px
            </option>
          ))}
        </select>
        <button
          aria-label="无序列表"
          onClick={() => run(wrapInList(schema.nodes.bullet_list))}
        >
          • 列表
        </button>
        <button
          aria-label="有序列表"
          onClick={() => run(wrapInList(schema.nodes.ordered_list))}
        >
          1.
        </button>
        <button onClick={table}>表格</button>
        <button onClick={() => run(addRowAfter)}>加行</button>
        <button onClick={() => run(addColumnAfter)}>加列</button>
        <button onClick={() => run(deleteTable)}>删表</button>
        <label className="file-button">
          图片
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              image(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <input
          className="link-input"
          aria-label="链接地址"
          placeholder="https://…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button
          onClick={() => {
            if (!/^(https?:|mailto:)/.test(link)) {
              props.onError("仅支持 http、https 或 mailto 链接");
              return;
            }
            run(toggleMark(schema.marks.link, { href: link }));
          }}
        >
          链接
        </button>
      </div>
      <div
        className="document-surface"
        style={{
          maxWidth: props.layout.width,
          padding: props.layout.margin,
          fontFamily:
            props.layout.font === "serif"
              ? '"Noto Serif CJK SC", serif'
              : '"Noto Sans CJK SC", sans-serif',
          fontSize: props.layout.font_size,
          lineHeight: props.layout.line_height,
        }}
      >
        <div ref={host} />
      </div>
    </div>
  );
});
export default Editor;
