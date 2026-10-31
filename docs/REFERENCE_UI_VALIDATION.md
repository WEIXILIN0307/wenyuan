# 公文智写界面对齐验证（2026-10-31）

代码提交 `f763897cbd224b0ae660b0371a03bfe3425fdfd5`，基线 `0f47b09`。
本轮只调整前端与依赖说明，沿用编辑器、数据库及 AI 事务协议。

## 实际参照与改动

先阅读旧项目 `4731fb8` 的主导航、写作工作台、AgentSidebar、知识库和模板组件。
旧部署入口受认证网关保护，因此另起仅监听回环地址的旧生产前端，以合成 API
响应渲染参考页面；没有访问旧知识库、客户文稿或真实聊天。参考截图只用于本地对照，
不作为文渊运行证据，也不上传。

文渊对齐主导航 248/72px、页头 56px、蓝色按钮、导航分组、304px 文稿栏、
模板四列卡片、知识库双面板及按需打开的原文大弹窗。Good AI 保留真实任务与差异确认，
改为滚动内容与底部输入；资料、模板、检查移至工作台左栏。Enter 生成，Shift+Enter 换行，
组合输入期间不提交。图标使用公开 npm 的 Lucide（ISC，附 Feather MIT notice），
锁文件、来源和第三方清单同步更新；未复制旧组件、模板、字体或 Office 发行包。

正文仍使用文渊的 ProseMirror 编辑器与布局模块，未宣称和旧 Office 引擎外观、
排版能力完全相同。没有加入未实现的长期记忆、自治 Agent、文件夹上传或模板市场入口。

## 测试记录

环境沿用四界面基线：Linux x86_64 / Xeon Gold 6226R 共享主机、Python 3.12.13、
Node 24.11.1、pnpm 10.17.1、Chromium 148.0.7778.96、系统 Noto CJK；
浏览器 1600×1000，另核对 1280×900。输出放在 `/data03/songbinbin/envs/wenyuan-local`。
以下命令在 `frontend` 中执行，除非注明。

| 类型 | 实际命令 | 结果 |
|---|---|---|
| 前端单元 | `pnpm test` | 9 passed，0 跳过 |
| 类型 | `pnpm typecheck` | 通过；最终生产构建再次完成类型检查 |
| 首轮浏览器 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e --output /data03/songbinbin/envs/wenyuan-local/aligned-e2e` | 9 passed，2 failed；新按钮“新建写作任务”与选择框标签部分匹配，尚未执行 AI 请求即中断。改名“开始新任务”修正歧义 |
| 完整复验 | 同上，输出 `aligned-e2e-final` | 11 passed / 1.4 分钟，0 跳过；真实 Next/FastAPI/SQLite/Chromium，AI 成功响应来自明确的 HTTP 模拟器 |
| 间距调整后关键路径 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e tests/browser/surfaces.spec.ts --output /data03/songbinbin/envs/wenyuan-local/aligned-e2e-spacing` | 2 passed / 23.3s；覆盖模板、上传、检索、原件、引用选用、跨界面选区保留、确认写入、撤销与底部输入。随后只微调模板标题和检索条间距，以生产截图复核 |
| 最终生产构建 | `WENYUAN_BACKEND=http://127.0.0.1:8118 pnpm build` | 编译、类型、静态生成与构建追踪通过 |
| 依赖清单 | 根目录 `backend/.venv/bin/python scripts/third_party.py --store-dir /tmp/wenyuan-pnpm-store` | 77 个已安装依赖、221 份随包许可/notice，新增 Lucide 的 ISC/MIT 文字已保留 |

新增浏览器断言检查组合输入 Enter、Shift+Enter 均不发送提案，正常 Enter 只发送一次；
建议出现时底部输入仍在视口，打开左侧资料不卸载右侧建议。原有异常保存恢复、
两标签冲突、生成期间编辑拒绝、60 次撤销重做、DOCX 回读等用例仍通过。
后端源码本轮未改，未重复运行完整本地后端套件；上轮 65 项结果见历史记录。
本轮不以键盘事件或 CDP 组合协议代替真实系统中文输入法人工验收。

## 生产浏览器、真实模型与媒体

API 8118 / 生产前端 3118，使用本次新建隔离账号和人工合成资料；服务器沿用维护者
授权的本地 `qwen3.5-9b`，未将申请表或客户文件发送给模型。下列私有媒体脚本只在
本地交付，公开复现流程见 [演示说明](DEMO.md)。

| 验证 | 根目录实际命令 | 结果 |
|---|---|---|
| 真实模型闭环与录制 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" node grant-private/record-aligned.cjs` | 模板→编辑→资料上传/检索/选用→选区改写→输入查看→可核对引用→确认→列表/表格→刷新→检查→DOCX 导出，连续完成；正文在确认前保持原样 |
| 真实失败 | 同上，脚本 `post-aligned.cjs` | 实际服务返回 HTTP 404，页面显示失败，正文不变；随后恢复模型配置 |
| 最终界面截图 | 同上，脚本 `capture-aligned.cjs` | 实际登录、未打开文稿、工作台、聚焦编辑、1280 宽度、模板目录/详情、知识库文件/原文与 Good AI；逐页视觉核对 |
| DOCX 独立回读 | `PYTHONPATH=backend backend/.venv/bin/python grant-private/check_export.py` | 2734 bytes；4 个标题、2 个列表项、3×3 表格及逐格文字通过；保留子集损失提示 |
| 独立 Office 渲染 | `libreoffice -env:UserInstallation=file:///data03/songbinbin/envs/wenyuan-local/lo-aligned-render --headless --convert-to pdf --outdir demo-materials demo-materials/exported-demo.docx` | LibreOffice 7.3.7.2 实际生成 1 页 A4 PDF；pdftotext 关键内容通过、pdftoppm 截图核对；字体、项目符号及表头外观有差异 |
| 视频 | `python -S grant-private/make_captions.py`；FFmpeg 编码；`python -S grant-private/check_media.py` | 151.16s / 1600×1080 / H.264 / 3,625,605 bytes；全片解码通过，25s/80s/115s 抽帧检查中文、字幕与画面；无加速剪接或虚构页面 |
| 隐私检查 | Gitleaks 8.30.1 对 Git 索引快照执行 `dir --redact=100`，并精确比对已知服务器密钥、演示令牌、表单联系方式 | 0 findings，已知值无匹配，私有目录未被跟踪；不把扫描等同于绝对无风险 |

本地媒体位于忽略路径 `demo-materials/`，实际存储在
`/data03/songbinbin/envs/wenyuan-local/media/demo-materials`；前版归档为 `before-layout-alignment`。
本轮新视频、截图和 DOCX/PDF 均未上传 GitHub 或第三方。旧 GUI 截图单独标为历史记录，
不计入本轮 Office 图形界面人工验收。未验证 Word/WPS、真实系统输入法、七种写作操作
的全部真实质量，也未声称已由维护者用播放器完整观看视频。

## 干净环境 CI

[GitHub Actions 41181055212](https://github.com/WEIXILIN0307/wenyuan/actions/runs/41181055212)
在最终代码提交 `f763897` 全部通过：ruff、后端 **65 passed / 10.54s**（1 条已有警告）、
前端 **9 passed**、类型与生产构建、浏览器 **11 passed / 1.3 分钟**，0 跳过。
CI 的 AI 为 HTTP 模拟器，真实模型结论仅来自上表本地验证。
