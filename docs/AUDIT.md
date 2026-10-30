# 旧项目审计与迁移白名单

审计时间：2026-10-30。参考仓库 `official_doc_AIWriter`，审计基线提交
`4731fb80f78626239db0aa784a9a4e61663f6f4a`。只读源码、说明和依赖清单；没有读取
`.env`、数据库、用户上传、聊天、日志或客户材料，也没有执行旧部署脚本。

## 证据与结论

旧 README 的当前主路径为 Next.js → ONLYOFFICE 插件 → FastAPI/ReAct；另有
ProseMirror 编辑路径。根目录及 Git 跟踪文件中没有找到 LICENSE/COPYING，故不能
推断整个仓库允许重新授权。抽样文件未标注完整作者/来源链；DocumentEditor 的最后
提交者为 Pinoeer-kingxi，这不是版权归属证明。下面所有旧项目自有实现的原始作者、
雇佣/委托关系、上游衍生关系均记为“待权利人确认”。

| 旧路径 | 功能和主要依赖 | 来源/授权判断 | 新项目处理 |
|---|---|---|---|
| `frontend/components/writer/DocumentEditor.tsx` | React、PM view/state/history/commands/tables；输入、选区、格式和工具入口 | 原作者待确认，无根授权 | 参考职责，重新实现 |
| `frontend/lib/prosemirror/document/{schema,ranges,snapshots,tools}.ts` | PM JSON、定位、快照、编辑工具；tools 中有 openwps headless 标识 | 可能关联 openwps，不能据此确认来源 | 重新设计版本化模型、节点 ID、事务 |
| `frontend/lib/layout/paginator.ts` | PM + `@chenglou/pretext`，文字测量、行与页、表格/浮动对象 | 自有算法权属待确认；基础库另审 | 不搬运算法；实现范围更小的测量布局 |
| `frontend/lib/docx/importer.ts` | JSZip、浏览器 XML、样式和浮动对象解析 | 自有转换代码待授权 | 独立实现安全 OOXML 子集 |
| `frontend/lib/docx/exporter.ts` | docx、JSZip、file-saver；含图片 fetch | 自有代码待授权；需重审 URL 边界 | 不复制；服务端导出和回读 |
| `backend/app/services/prosemirror_to_docx.py` | python-docx；与前端存在第二套映射 | 作者待确认 | 单一新转换层，避免双写 |
| `backend/app/services/react_engine/{loop,office_tools,office_command_broker,document_session}.py` | LangChain/LangGraph、SQLAlchemy、Redis、ONLYOFFICE；SSE/receipt/revision | 自有协议和实现待授权 | 参考失败关闭原则；重写无 Office 桥的提案协议 |
| `docs/office-agent-tool-contract.md` | 选区、receipt、引用权限与保存语义 | 文档权属待确认 | 不复制文字，制定新协议 |
| `backend/app/services/react_engine/llm_factory.py`、`llm_provider_resolver.py` | ChatOpenAI、数据库 provider、vLLM 配置 | 自有代码待授权 | 直接实现 OpenAI 兼容 HTTP provider |
| `backend/app/services/{hybrid_rag_service,retrieval_orchestrator,vector_store_v3}.py`、`capability/preprocessing/` | Milvus/BM25/RRF/embedding、模型检索规划 | 作者待确认；实际知识库绝不迁移 | 首版独立实现单机、带版本片段的字面检索 |
| `backend/app/tests/test_docx_converter.py`、`test_docx_tools.py`、`test_phase1_data_integrity.py`、`test_writer_review_regressions.py` 等 | 格式、版本、安全及 Office 回执测试 | 测试文字与 fixtures 权属未明 | 参考测试类别，全新合成 fixtures |
| `frontend/package.json`、`pnpm-lock.yaml`、`backend/requirements.txt` | Next 16.2.11/React19、PM；后端大量未固定依赖 | 包许可证须逐版本独立核对 | 新选最小依赖，生成新锁文件 |
| `deploy/document-engine/sources.lock`、`DOCUMENT_ENGINE_SOURCE_PLAN.md` | ONLYOFFICE 9.4.0 源码锁定、AGPLv3 附加条款、再品牌化部署 | 不能视为 Apache 自有内核 | 全部排除 |

## 分类与白名单

1. **可候选迁移但需确认权属**：上表中的自有通用实现、文档、测试。在获得书面授权、
   来源链及兼容性结论前，白名单为空。当前没有旧源码或资产进入新仓库。
2. **可参考设计、重新实现**：JSON 正文、版本冲突、原文 hash、确认后应用、引用回读、
   保存回执。新实现不是“完全从零”的编辑库：PM 负责基础编辑/输入法/历史/DOM 选区。
3. **第三方**：重新从公开包仓库安装 Next/React/PM/FastAPI 等，保留许可，锁定版本；
   不从旧 node_modules/vendor 拷贝制品。
4. **禁止进入**：ONLYOFFICE core/sdkjs/web-apps/x2t/发行包/补丁、`.vendor`、
   `.source-packages`、构建缓存、旧 Git 历史、模板、字体、图片、用户/客户文件、真实
   知识库、账号、密钥、生产日志与内部部署配置。禁止 iframe/远程 Office 代理内核。

审计只覆盖上述实际阅读范围，不等于旧仓库法律尽调结论。参考项目 AI_Writer、
afac_agent、openwps、office-website-main 未作为可授权来源使用。
