# 文档与 AI 编辑协议 v1

正文唯一来源为 SQLite documents.body 中的 `{title, content, layout}`，content 为
PM 兼容树，外层 schema_version=1。不可变 revisions 是只读历史，不是第二份可编辑
正文；浏览器恢复稿仅是未确认事务的本地备份，不会后台反向覆盖服务端。

所有人工/AI 内容修改、重命名、格式设置与版本恢复均提交
`POST /documents/{id}/transactions`。操作格式：

```json
{
  "operation_id": "opaque_unique_id_123",
  "base_revision": 7,
  "expected_hash": "64位十六进制SHA256",
  "operations": [{
    "type": "replace_text", "node_id": "stable_paragraph_id",
    "start": 2, "end": 5, "expected_hash": "选区UTF-8原文的SHA256", "text": "建议文字"
  }],
  "proposal_id": "AI确认时绑定原提案ID"
}
```

偏移为同一段落内 UTF-16 单元，拒绝拆分 emoji 代理对；不得用文本搜索第一处作为
定位。人工编辑器以 snapshot 提交同一规范树，AI 只生成 replace_text/append_blocks。
snapshot 可附 metadata，不能混合文字 patch。删除为 text=""；插入 start=end。

事务在 `BEGIN IMMEDIATE` 中检查 owner + revision + body hash + 提案状态 + 原文 hash，
进行完整模型验证，然后更新正文、历史与回执。请求 hash 绑定 doc_id 和完整请求。
相同 ID/相同请求返回原结果；复用 ID 改变内容返回 409。数据库提交与内容/历史回读
校验完成后才返回 saved。received/executed 为同一原子事务内阶段；独立读者不会看到
半保存状态。与磁盘失败一起回滚，不能把收到请求当作已保存。

断线后查询 `GET /operations/{operation_id}`；存在 saved 则使用原回执，不再插入。
404 表示没有已确认的提交，客户端只可重发同 ID、同正文请求，不能改成新 ID。
SQLite 单机串行 CAS 保证并发相同请求也只应用一次。失去响应仍不能声称执行成功。
文档被其他标签页修改时返回 409，保留本地恢复稿，需要人工核对或另存。

AI 提案记录 document_id/base_revision/base_hash、选区、原文、操作与来源。
状态为 generating→ready→accepted/rejected，或 failed/cancelled/interrupted。
服务重启将生成中任务标记 interrupted；单进程启动，任务注册表用于取消/退出清理。
接受时只能提交原提案操作，不允许篡改后借用 proposal_id。前后端都拒绝过期 revision。
AI 不操作 DOM，不持有文件/网络/删除工具。材料位于独立参考消息中且无工具权限。
输出 JSON 必须完整解析、校验并正常结束；错误、超时、截断、取消均不产生可写 patch。
引用需匹配检索返回的 chunk_id 及原文 quote，版本/标题由服务端补齐。这只能证明
摘录存在，不能证明生成句子都由该摘录支持；事实审核仍由用户负责。

删除文档以 revision 校验，数据库级联删除修订、回执、资料原件、索引、提案和导入原件。
所有正文、原件、索引、提案、历史、导出均首先执行文档 owner 校验。
