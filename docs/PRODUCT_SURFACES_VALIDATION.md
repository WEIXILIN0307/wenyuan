# 四界面验证（2026-10-30）

代码提交 `260a7efb244bfe900f0a31930e495d135113c518`，基线 `137f75b`。
功能与旧项目参考范围见 [实现对照](PRODUCT_SURFACES.md)。

环境：Linux x86_64 / Xeon Gold 6226R 共享开发主机，Python 3.12.13、Node 24.11.1、
pnpm 10.17.1、Chromium 148.0.7778.96、系统 Noto CJK，浏览器 1600×1000；另检查
1280×900 桌面布局。未以单次结果承诺性能提升。
下表 `$WENYUAN_CHROMIUM` 实际为
`/home/songbinbin/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`。

## 实际命令与结果

| 类别 | 命令（项目根目录，注明处先 cd） | 实际结果 |
|---|---|---|
| Python 静态检查 | `backend/.venv/bin/ruff check backend/wenyuan backend/tests scripts` | 通过 |
| 后端单元/API/模拟传输 | `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -p asyncio -q` | **65 passed / 7.56s**，0 跳过；1 条已有测试客户端弃用警告 |
| 前端单元 | `cd frontend && pnpm test` | **9 passed**，0 失败/跳过 |
| 前端类型 | `cd frontend && pnpm typecheck` | 通过；最终生产构建也完成类型检查 |
| 首轮真实浏览器，AI 为 HTTP 模拟器 | `cd frontend && WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e --output /data03/songbinbin/envs/wenyuan-local/surfaces-e2e` | **10 passed、1 failed**：新增测试配置了共享测试账号的模型，破坏旧测试“未配置模型”的前置条件；不计作全通过 |
| 修正测试账号隔离后完整浏览器 | 同上，输出目录改为 `/data03/songbinbin/envs/wenyuan-local/surfaces-e2e-final` | **11 passed / 1.3 分钟**，0 跳过；真实 Next/FastAPI/SQLite/Chromium，成功 AI 使用明确的 HTTP 模拟器 |
| 最终生产构建 | `cd frontend && WENYUAN_BACKEND=http://127.0.0.1:8118 pnpm build` | 编译、类型检查与静态生成通过 |
| 实际生产浏览器 | `pnpm start --port 3118` + `node grant-private/capture-surfaces.cjs`（本地私有脚本） | 登录、四界面、模板详情、原文检查器、两侧收起与 1280 宽度实际截图并视觉核对 |
| 真实模型闭环 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" node grant-private/record-surfaces.cjs` | 新隔离账号、合成文稿/知识库、原授权本地 **qwen3.5-9b**；模板→知识库上传/检索/选用→选区改写→引用核对→确认→列表表格→刷新→导出，完整执行 |
| 真实失败提示 | 同一 Chromium，`node grant-private/post-surfaces.cjs` | 真实服务 **HTTP 404** 可见、正文不变；恢复原模型配置 |
| DOCX 独立回读 | `PYTHONPATH=backend backend/.venv/bin/python grant-private/check_export.py` | 2717 字节；**4 个标题、2 个列表项、3×3 表格**及逐格文字核对通过 |
| 独立 Office 渲染 | `libreoffice -env:UserInstallation=file:///data03/songbinbin/envs/wenyuan-local/lo-surfaces-render --headless --convert-to pdf --outdir demo-materials demo-materials/exported-demo.docx` | 真实 LibreOffice 7.3.7.2 生成 **1 页 A4**，`pdftotext` 检查内容、`pdftoppm` 渲染截图；保留字体、符号与表头外观差异 |
| 视频完整性 | FFmpeg 加字幕；`python -S grant-private/check_media.py` | **151.32s / 1600×1080 / H.264 / 3,883,525 bytes**；全片解码通过，25s/80s/115s 抽帧核对，连续录制、无加速剪接；非多播放器人工完整观看验收 |
| 密钥与隐私 | Gitleaks 8.30.1 对 Git 索引快照执行 `dir --redact=100`；已知服务器密钥、演示令牌和提供的联系方式精确比较 | **0 findings**、已知值无匹配；未跟踪媒体、表单或私有脚本。扫描不代表绝对保证 |

后端新增用例验证账号隔离（列表、检索、原件、上传、删除、跨账号文稿选用）、
重复选用复用同一引用、删除知识库后引用仍可核对、删除文稿清理副本/FTS、
持久化、危险文件名/宏格式和上传大小。新增浏览器用例验证模板搜索/预览/创建、
知识库实际上传/片段/原件/选用/刷新、Good AI 保留选区与要求、确认写入，以及导航后手工撤销。
原版本冲突、生成期间修改拒绝、异常保存恢复和 DOCX 回读用例仍通过。

单次 4500 UTF-16 单元测量：输入至保存 835ms（含 debounce），打开分页 137ms、4 页。
系统中文输入法仍只有 CDP 组合协议模拟；本轮未重新完成 Office GUI 人工验收，未验证
Word/WPS，也没有将一次真实改写扩展为七种写作操作全部质量验收。

媒体与隔离数据仍在忽略路径并实际存储于 `/data03`；前版归档在
`media/before-product-surfaces`。没有上传视频、截图、申请表、个人联系方式，
没有提交基金申请或创建 GitLink 镜像。

## 干净安装 CI

[GitHub Actions 41166674068](https://github.com/WEIXILIN0307/wenyuan/actions/runs/41166674068)
在代码提交 `260a7efb244bfe900f0a31930e495d135113c518` 全部通过：Python 3.12 / Node 22，
ruff、后端 **65 passed / 5.83s**、前端 **9 passed**、类型检查和生产构建、浏览器
**11 passed / 1.1 分钟**。CI 的 AI 使用 HTTP 模拟器，真实模型证据来自上表的本地生产录屏。
后续仅补 README 与验证记录，以 `[skip ci]` 提交，不变更应用代码。
