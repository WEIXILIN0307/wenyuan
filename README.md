# 文渊 Wenyuan

面向中文文章、公文与长文档的单机 AI 写作工作台。Next.js/React + FastAPI + SQLite，
正文以版本化 JSON 保存，AI 先提出建议，用户确认后通过同一事务入口写入。

这是可运行的 0.1 开发版本，**尚未完成全部首期发布验收**。本轮增量对照见
[功能对照](docs/SEED_GAP_ANALYSIS.md)。真实模型、系统输入法和
Office 人工兼容性验收状态见 [验证记录](docs/SEED_VALIDATION.md)，不把模拟测试算作真实
模型验证，不承诺任意 DOCX 无损往返。不包含或下载完整 Office 引擎。

## 快速启动

要求 Linux、Python 3.12+（SQLite 启用 FTS5）、Node.js 22+、pnpm 10.17.1、uv；无需 GPU、Docker、
Redis、Milvus、Office 引擎。系统中文字体可自行安装 Noto CJK，本项目不分发字体。

```bash
bash scripts/setup.sh
```

管理命令在 backend 中运行；新生成的登录令牌只显示一次，请妥善保存：

```bash
cd backend
WENYUAN_DATA=../.data .venv/bin/python -m wenyuan.manage create-user --name local
cd ..
bash scripts/dev.sh
```

浏览器访问 http://127.0.0.1:3000，输入登录令牌。首次创建空白文档，或导入
`examples/synthetic.md`。默认不会调用任何模型；服务不可用时显示实际错误。
默认应用仅监听 loopback；远程单机部署须配置 TLS、精确 WEB_ORIGINS 和 Secure Cookie。

## 模型配置

工作台设置填写 OpenAI 兼容服务地址、模型名称和可选思考模式。密钥**不进入浏览器**，
由管理员在服务端配置。服务需支持 `response_format: {type: "json_object"}` 与
`finish_reason=stop`。默认只允许 `https://api.openai.com`；使用本地服务时显式允许 origin：

```bash
export WENYUAN_MODEL_ORIGINS='https://api.openai.com,http://127.0.0.1:11434'
cd backend
WENYUAN_DATA=../.data .venv/bin/python -m wenyuan.manage configure-provider \
  --name local --base-url http://127.0.0.1:11434/v1 --model your-model
# 有密钥时加 --key-stdin，从安全的标准输入传入；不要把密钥写入参数或历史。
cd ..
bash scripts/dev.sh
```

默认不发送服务商扩展参数。支持 vLLM/Qwen 的本地服务可在页面关闭思考，或 CLI
加 `--thinking off`（发送 `chat_template_kwargs`）；其他服务保持默认。未实测时不承诺延迟收益。
不加密钥选项会保留已有密钥；`--clear-key` 清除；无密钥本地服务可直接使用。
管理员只允许可信 origin；请求禁止重定向、不继承系统代理，路径只支持空路径或 `/v1`。
页面告知文稿和资料可能发送给配置的模型。服务端 Fernet 加密密钥，密钥文件权限
0600，配置接口仅返回 `key_configured`。备份需同时保护数据库和 `provider.key`。

## 已接入的工作流程

- 三栏工作台：文稿与大纲、正文、写作/资料/历史/检查；可收起两侧面板扩大编辑区。
- 原创通知、工作总结、简报、通用文章模板；创建新文稿并设置基础页面与标题样式。
- 规则检查：空标题/正文、模板待填项和必要章节、日期星期、历史引用存续；展示依据，无综合分。
- 创建/打开/重命名/删除；自动保存、本地恢复稿、失败提示；JSON 原生文件。
- PM 基础编辑：中文文本、标题、粗斜体、字号颜色、对齐段距、列表链接、PNG/JPEG、
  简单矩形表格、复制粘贴、快捷键和历史。段落/节点使用唯一 ID。
- 按标题派生大纲；页宽/页高/四边距/字体/行距设置；自有测量模块的独立分页预览，
  可点击文字映射回编辑位置。连续编辑区本身不宣称实现 Word 分页。
- Markdown、DOCX 明确子集导入/导出；保留导入原件、可见损失说明、导出回读校验。
- TXT/MD/DOCX/原生 JSON 资料提取、SQLite FTS5 中文字符/双字字面索引、片段回读和版本引用。
- 生成前可查看实际选区、正文背景和资料，引用可定位到原始片段。
- 真实 HTTP 模型适配器：提纲、草稿、同段选区改写/续写/扩写/压缩/纠错；生成任务可
  取消，差异预览、接受/拒绝；接受必须匹配生成时修订、原文 hash 和原提案操作。
- 统一事务、所有权、revision CAS、幂等 ID、未知结果查询、不可变修订和操作记录。

边界与损失见 [格式矩阵](docs/COMPATIBILITY.md)；当前 AI 选区只支持同一纯文本
段落，人工编辑支持跨段；资料检索采用字面分词，不声称有语义向量召回能力。没有复杂
多人协作、Excel/PPT、宏/OLE、Word 完整兼容、任意语言排版或生产 SLA。

## 测试

```bash
cd backend
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -p asyncio -q
cd ../frontend
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

浏览器测试启动隔离的 API 和 Next.js，使用新建临时数据库和合成资料；不使用旧项目
账号/模型/生产数据。已有 Chromium 可用 `WENYUAN_CHROMIUM=/绝对路径` 指定。
实际命令、实测环境、已知缺口和发布门槛见 [本轮验证](docs/SEED_VALIDATION.md) 与 [历史基线](docs/VALIDATION.md)。

## 目录与设计

`backend/wenyuan/core.py` 定义模型与纯事务；`store.py` 处理 SQLite 原子提交；
`formats.py` 与资源限制 `worker.py` 处理格式；`ai.py` 管理提案；`api.py` 提供所有权
边界。`frontend/lib` 包含 schema、可靠保存队列和自有布局；`components` 提供工作台。
架构图和阶段计划见 [PLAN](docs/PLAN.md)，协议见 [PROTOCOL](docs/PROTOCOL.md)。

这是参考旧项目领域设计的新实现，**不是全部代码从零编写的编辑器**：ProseMirror
提供输入法处理、选区、DOM 编辑、粘贴、基础命令和撤销；文渊负责模型约束、节点身份、
统一事务与持久化、布局预览、格式转换和 AI 编辑协议。

## 来源与许可

新编写源码采用 Apache-2.0；不覆盖第三方依赖、系统字体或用户资料，也不重新授权
旧仓库。旧源码迁移白名单为空，旧仓库没有发现可据以再许可的根许可证。
开发代码仓库为 https://github.com/WEIXILIN0307/wenyuan 。正式版本发布前仍需完成
人工验收及目标平台依赖/二进制的许可核验；旧项目不明权属内容不在发布范围。
见 [审计](docs/AUDIT.md)、[PROVENANCE](PROVENANCE.md)、[第三方清单](THIRD_PARTY_NOTICES.md)
与 [LICENSE](LICENSE)。包版本与完整性锁定在 `backend/uv.lock` 和 `frontend/pnpm-lock.yaml`。

## 演示与申报

复现步骤见 [演示说明](docs/DEMO.md)，测试与兼容结果见 [种子计划验证](docs/SEED_VALIDATION.md)
及 [界面整理记录](docs/UI_POLISH_VALIDATION.md)。
本地 `demo-materials/wenyuan-demo.mp4` 为约 2 分 31 秒真实模型演示；
`demo-materials/` 另有实际运行截图、DOCX 与 LibreOffice 对照 PDF。按维护者要求不推送
媒体。申请表及个人联系方式仅保存在本地忽略目录，未提交申请、未创建 GitLink 镜像。
项目目前由 1 人维护，无已核实外部用户与商业收入，不以合成案例代替实际用户。
