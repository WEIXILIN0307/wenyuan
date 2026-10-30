# 种子计划增量验证（2026-10-30）

代码基线 `92c5134`；本轮变更提交见 Git 中本文件所在提交及前一功能提交。
本机 Linux x86_64 / Xeon Gold 6226R / Python 3.12.13 / Node 24.11.1 / pnpm 10.17.1；
Chromium 148.0.7778.96，1600×1000，系统 Noto CJK 字体。共享主机，不作生产性能外推。
旧记录 [VALIDATION](VALIDATION.md) 保留历史结论，本文件记录后续授权后的增量验证。

## 实际命令与结果

| 类别 | 命令 | 结果 |
|---|---|---|
| 后端单元/API/模拟传输 | `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -p asyncio -q` | 60 passed，5.29s；1 条 Starlette/httpx 测试客户端弃用警告；0 跳过 |
| 静态检查 | `cd backend && .venv/bin/ruff check wenyuan tests` | 通过 |
| 前端类型 | `cd frontend && pnpm typecheck` | 通过 |
| 前端单元 | `cd frontend && pnpm test` | 9 passed；60 次撤销/重做等；0 跳过 |
| 真实浏览器/真实应用，AI 成功采用测试 HTTP 模拟器 | `cd frontend && WENYUAN_CHROMIUM=/本机/chrome-headless-shell pnpm test:e2e` | 最终 8 passed，约 1 分钟；0 跳过。含模板/检查/精确片段/输入上下文、断网恢复、双标签冲突、生成期间修改拒绝 |
| 生产构建 | `cd frontend && WENYUAN_BACKEND=http://127.0.0.1:8118 pnpm build` | 成功；生产模式 `pnpm start --port 3118` 实际启动，API 使用隔离数据目录监听 8118 |
| 真实模型（维护者明确授权） | 本地 `grant-private/probe_rewrite.py`；通过实际 API 创建合成文稿与资料、生成提案、确认、GET 回读 | 原公文项目部署的 qwen3.5-9b；88.78s，1 个有效引用，4068 tokens（服务端报告），确认前未改正文，确认后内容 hash 回读一致 |

首次浏览器运行为 6 通过、2 失败：无密钥请求的空 Bearer 头导致模型连接失败，以及
新测试按钮名称写错。修复后针对两条流程复测 2 passed，再完整复测 8 passed。
真实模型首轮草稿引用不合法，91.61s 后被拒绝且未写入；明确 source_data 的 chunk_id
后，真实改写验证通过。未保留或打印模型密钥和远程原始错误正文。

## 覆盖与边界

- 文稿、事务和格式沿用现有实现；新增模板绑定经同一事务，原生 JSON 往返保留。
- 资料上传、SQLite 检索和精确片段回读已通过真实浏览器；引用必须匹配版本、片段 ID
  与逐字摘录，不能据此声称所有生成句子都被引用证明。
- 模型超时、取消、截断、错误 JSON、错误引用、过期修订、拒绝与重复文本定位保留
  单元/模拟测试。真实模型仅验证上述明确动作，不把其余 6 种操作都写成已真实验收。
- 安全边界测试覆盖 owner 隔离、危险文件、解压限制、DTD/实体、外部图片不抓取、
  模型 origin 限制、密钥密文。新增 public provider 不含密钥字段，CLI 仅从 stdin 收密钥。
- 中文输入法仅 Chromium CDP 组合协议模拟；操作系统输入法候选框和人工输入仍待验收。
- 本轮长段单次基线：4500 UTF-16 单元，输入至自动保存 835ms（含 700ms debounce），
  打开基础分页预览 140ms，4 页。不视为性能提升、p95 或跨设备承诺。

## 本地媒体与独立 Office

连续录像、导出回读、Office GUI 检查与材料隔离的最终结果在本轮交付后补记。
申请表与联系方式只保存在根目录忽略文件和 grant-private；演示媒体位于 demo-materials，
不推送。未提交申请，未创建 GitLink 镜像。当前外部用户、商业化与旧素材授权均不推测。
