import { id, type Document, type DocNode, type Operation } from "./model";
export type Pending = {
  operation_id: string;
  base_revision: number;
  expected_hash: string;
  operations: Operation[];
  proposal_id?: string;
};
export type Recovery = {
  base_revision: number;
  draft: DocNode;
  pending: Pending | null;
  sent_draft?: DocNode;
};
export type Transport = <T = any>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
export const equal = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  ) ===
  JSON.stringify(b, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

export class SaveQueue {
  base: Document;
  draft: DocNode;
  pending: Pending | null = null;
  blocked = false;
  error = "";
  private work: Promise<void> | null = null;
  private transactionTail: Promise<void> = Promise.resolve();
  private pendingDraft: DocNode | null = null;
  constructor(
    base: Document,
    private transport: Transport,
    private persist: (record: Recovery | null) => void,
    private changed: () => void,
  ) {
    this.base = base;
    this.draft = base.content;
  }
  get dirty() {
    return !equal(this.draft, this.base.content) || this.pending !== null;
  }
  private stash() {
    this.persist(
      this.dirty
        ? {
            base_revision: this.base.revision,
            draft: this.draft,
            pending: this.pending,
            ...(this.pendingDraft ? { sent_draft: this.pendingDraft } : {}),
          }
        : null,
    );
  }
  update(content: DocNode) {
    this.draft = content;
    this.stash();
    this.changed();
  }
  async recover(record: Recovery) {
    this.draft = record.draft;
    this.pending = record.pending;
    this.pendingDraft = record.sent_draft || null;
    let expected = record.base_revision;
    if (this.pending) {
      try {
        const status = await this.transport(
          `/operations/${this.pending.operation_id}`,
        );
        if (status.state === "saved") {
          expected = status.result.document.revision;
          if (
            this.pending.operations[0]?.type !== "snapshot" &&
            equal(this.draft, this.pendingDraft)
          )
            this.draft = status.result.document.content;
          this.pending = null;
          this.pendingDraft = null;
        }
      } catch (e) {
        if ((e as any).status !== 404) {
          this.error = "恢复时无法确定上次保存状态，请重试查询";
          this.changed();
          return;
        }
      }
    }
    if (
      equal(this.draft, this.base.content) &&
      (!this.pending || this.pending.operations[0]?.type === "snapshot")
    ) {
      this.pending = null;
    } else if (expected !== this.base.revision) {
      this.blocked = true;
      this.error = "本地恢复稿与服务端版本冲突；已保留恢复稿，请下载后核对";
    }
    this.stash();
    this.changed();
  }
  save(): Promise<void> {
    if (this.work)
      return this.work.then(() => (this.dirty ? this.save() : undefined));
    this.work = this.flush().finally(() => {
      this.work = null;
      this.changed();
    });
    return this.work;
  }
  private async execute(tx: Pending): Promise<Document> {
    let result;
    if (this.pending) {
      try {
        const status = await this.transport(`/operations/${tx.operation_id}`);
        if (status.state === "saved") return status.result.document;
      } catch (e) {
        if ((e as any).status !== 404) throw e;
      }
    }
    result = await this.transport(
      `/documents/${this.base.id}/transactions`,
      tx,
    );
    if (result.state !== "saved")
      throw new Error("操作尚未确认保存，请查询操作状态");
    return result.document;
  }
  private async flush() {
    if (this.blocked) throw new Error(this.error);
    this.error = "";
    this.changed();
    try {
      while (this.dirty) {
        const tx = this.pending || {
          operation_id: id(),
          base_revision: this.base.revision,
          expected_hash: this.base.content_hash,
          operations: [{ type: "snapshot", content: this.draft }],
        };
        this.pending = tx;
        if (!this.pendingDraft) this.pendingDraft = this.draft;
        this.stash();
        const saved = await this.execute(tx);
        if (tx.operations[0]?.type !== "snapshot") {
          const metadataOnly = tx.operations.every(
            (op) => op.type === "metadata",
          );
          if (!equal(this.draft, this.pendingDraft) && !metadataOnly) {
            this.blocked = true;
            throw new Error(
              "上次操作已保存，但期间存在本地编辑，请下载恢复稿后人工核对",
            );
          }
          if (!metadataOnly) this.draft = saved.content;
        }
        this.base = saved;
        this.pending = null;
        this.pendingDraft = null;
        this.stash();
        this.changed();
      }
    } catch (e) {
      this.error = (e as Error).message;
      this.blocked ||= (e as any).status === 409;
      this.stash();
      this.changed();
      throw e;
    }
  }
  transact(operations: Operation[], proposal_id?: string): Promise<Document> {
    const result = this.transactionTail.then(async () => {
      await this.save();
      const execution = this.applyTransaction(operations, proposal_id);
      this.work = execution
        .then(() => {})
        .finally(() => {
          this.work = null;
          this.changed();
        });
      await this.work;
      return this.base;
    });
    this.transactionTail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private async applyTransaction(
    operations: Operation[],
    proposal_id?: string,
  ) {
    const tx = {
      operation_id: id(),
      base_revision: this.base.revision,
      expected_hash: this.base.content_hash,
      operations,
      ...(proposal_id ? { proposal_id } : {}),
    };
    // Persist unknown outcomes before sending even for metadata/AI operations.
    this.pending = tx;
    this.pendingDraft = this.draft;
    this.stash();
    this.changed();
    try {
      const saved = await this.execute(tx);
      const metadataOnly = operations.every((op) => op.type === "metadata");
      if (!equal(this.draft, this.pendingDraft) && !metadataOnly) {
        this.blocked = true;
        throw new Error("操作期间存在新的本地编辑，请保留恢复稿后核对");
      }
      this.base = saved;
      this.pending = null;
      this.pendingDraft = null;
      if (!metadataOnly) this.draft = this.base.content;
      this.stash();
      this.changed();
      return this.base;
    } catch (e) {
      this.error = (e as Error).message;
      this.blocked ||= (e as any).status === 409;
      this.stash();
      this.changed();
      throw e;
    }
  }
}
