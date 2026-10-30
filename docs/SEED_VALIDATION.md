# 种子计划增量验证（2026-10-30）

原基线 `92c5134`；功能提交 `c7d2084`（模板/输入/资料/检查）与 `f68770e`
（可选本地思考模式、表格光标修复）。本文件后续提交仅整理文档和忽略规则。最终完整干净安装验证基线为 `441f806`。
旧记录 [VALIDATION](VALIDATION.md) 保留初始状态，本文件记录获授权后的增量验证。

环境：Linux x86_64 / Xeon Gold 6226R / Python 3.12.13 / Node 24.11.1 / pnpm 10.17.1；
Chromium 148.0.7778.96、1600×1000、系统 Noto CJK 字体，共享开发主机。
本机浏览器路径为 `/home/songbinbin/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`，下表以 `$WENYUAN_CHROMIUM` 表示。
所有文稿、资料和账号均为本轮隔离创建；模型经维护者明确授权，服务端消费旧项目
本地部署配置，未输出、提交凭据或读取旧客户文稿。

## 实际命令与结果

| 类别 | 命令（从项目根目录，注明处先 cd） | 结果与范围 |
|---|---|---|
| 后端单元/API/模拟传输 | `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -p asyncio -q` | 首个增量完整运行 **60 passed，5.29s**；1 条 Starlette/httpx 测试客户端弃用警告，0 跳过 |
| 本地模型参数后续回归 | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 backend/.venv/bin/python -m pytest -p asyncio backend/tests/test_ai.py -q` | 后续代码 **20 passed，1.67s**，含新增 2 个可选思考参数案例；未再次整套运行，不宣称 62 passed |
| Python 静态检查 | `backend/.venv/bin/ruff check backend/wenyuan backend/tests scripts` | 通过 |
| 前端类型 | `cd frontend && pnpm typecheck` | 通过；后续生产构建亦包含类型检查 |
| 前端单元 | `cd frontend && pnpm test` | **9 passed**，0 跳过；包括 60 次撤销/重做，相关 lib 之后未改动 |
| 真实 Chromium/Next/FastAPI/SQLite，AI 成功用测试 HTTP 模拟器 | `cd frontend && WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e` | 首个增量完整运行 **8 passed，约 1 分钟**，0 跳过；模板、片段定位、输入上下文、恢复、双标签冲突、生成期间修改拒绝等 |
| 表格修复后针对性浏览器回归 | `cd frontend && WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e --grep 'paste text'` | **1 passed，18.0s**；9 格键盘填写、逐格断言、导出后重新导入；其余 7 条未再次运行 |
| 最终生产构建/实际运行 | `cd frontend && WENYUAN_BACKEND=http://127.0.0.1:8118 pnpm build`；`pnpm start --port 3118` | 成功；API 8118 与 Web 3118 从隔离数据目录启动，实际浏览器录制 |
| 真实模型改写、确认、回读 | `PYTHONPATH=backend backend/.venv/bin/python grant-private/probe_rewrite.py`（本地私有复现脚本） | 原部署 **qwen3.5-9b**；默认模式一次 88.78s / 4068 tokens，关闭思考后一次 **6.08s / 718 tokens**，均 1 个有效引用；确认前不写，确认后 hash 回读一致 |
| 真实生成安全路径 | `PYTHONPATH=backend backend/.venv/bin/python grant-private/verify_live_safety.py` | 生成期间人工写入后旧提案 **409**，新稿保留；取消为 cancelled；真实无效模型 **HTTP 404**，正文不变，恢复原配置 |
| 真实浏览器失败提示 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" node grant-private/post-demo.cjs` | 实际服务 HTTP 404 在界面可见，正文未变；截图 `12-real-failure.png` |
| 连续真实浏览器录屏 | `WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" node grant-private/record-demo.cjs`；FFmpeg 加字幕封装 | 最终 **151.24s，1600×1080，H.264 MP4，3,546,188 bytes**；真实本地模型、合成账号与资料，无配音，无界面伪造或加速剪接 |
| 导出独立回读 | `PYTHONPATH=backend backend/.venv/bin/python grant-private/check_export.py` | 2717 bytes DOCX；**4 个标题、2 个列表项、3×3 表格**，逐格文字核对通过；保留受限子集损失提示 |
| 独立 Office | `DISPLAY=:118 SAL_USE_VCLPLUGIN=gen libreoffice -env:UserInstallation=file:///tmp/wenyuan-gui-final118 --norestore --nofirststartwizard --nologo --writer /本地/demo-materials/exported-demo.docx` | LibreOffice **7.3.7.2** 实际 Writer GUI 只读打开，在独立 Xvfb 中由代理视觉检查；无维护者人工签署 |
| Office PDF 对照 | `libreoffice -env:UserInstallation=file:///tmp/wenyuan-final-export-render118 --headless --convert-to pdf --outdir demo-materials demo-materials/exported-demo.docx`；`pdftotext -layout ...` | **1 页 A4**，标题、正文、列表与每格文字齐全；实际 GUI 与 PDF 图像见本地材料 |
| 媒体完整性 | `python -S grant-private/check_media.py`（ffprobe + FFmpeg 全片解码）；抽帧视觉核对 | H.264、尺寸、时长、全片解码通过；67s、101s 等关键画面文字可读。未声称人工完整观看或多播放器验收 |
| 密钥/私有文件 | `gitleaks git --redact=100 --report-format json .`（8.30.1）；已跟踪文件与已知凭据/联系方式精确比较 | 功能提交后 8 个独立提交，**0 findings**；无已知模型密钥、提供的电话/邮箱、表单或新媒体进入 Git。扫描不代表绝对保证 |

## 干净安装 CI

[GitHub Actions 41073316416](https://github.com/WEIXILIN0307/wenyuan/actions/runs/41073316416)
在提交 **`441f8067c4362c13b6d59b277c35447c2eb037bc`** 全部通过：Ubuntu 托管 runner、
Python 3.12、Node 22，`scripts/setup.sh` 干净安装，ruff、后端完整 **62 passed / 5.63s**、
前端类型/单测/生产构建、完整浏览器 **8 passed / 46.7s**。CI 中模型为明确的测试模拟器，
不使用开发主机凭据，不代替上表的真实本地模型验收。之后仅补记本文与 README，
以 `[skip ci]` 提交，未变更应用代码。上表保留本地分批结果，不把它们相加冒充一次全跑。

## 发现、修复与范围

- 首次浏览器为 6 通过、2 失败：无密钥请求带空 Bearer 头，以及新测试按钮名错误。
  修复后针对性 2 passed，再完整 8 passed。无密钥时不发送 Authorization。
- 真实草稿曾在 91.61s 后因错误引用被拒绝、正文未变；明确传递 chunk_id 后改写通过。
  引用只证明摘录存在，不能证明全部句子由引用支撑。
- 一轮录屏真实请求超过 120s，界面超时且无写入；新增可选思考开关，默认不发送厂商
  参数。一次模型不愿引用合成资料时显示无引用警示，没有伪造引用；澄清合成任务后
  重新录制。上述不完整片段不冒充最终成功演示。
- 复核还发现表格插入后的光标在表格外，早期用例只检查“存在表格”。已修复选区到
  首格，增加逐格输入与导出回读，最终录屏和导出重新制作。导出回读一致不能证明
  用户操作符合预期，须同时核对单元格内容。
- Office 对照中内容/基础结构齐全，但标题字体/大小、项目符号、表头底色/粗细与
  浏览器有显示差异。保留受限兼容声明，不宣称 Word/WPS 无损或法定公文格式认证。
- 安全边界覆盖 owner 隔离、危险文件与解压限制、DTD/实体、外部图片不抓取、模型
  origin、密钥密文；公开 provider 无密钥字段。没有新增依赖，锁文件/许可清单保留。

## 尚未完成

操作系统中文输入法仍只做 CDP 组合协议模拟，候选框、真实输入需人工补验；Word/WPS
未验收，LibreOffice GUI 由代理操作与视觉核对，未由维护者人工签署。七种 AI 操作均有
接口，但真实模型主要验证改写及安全路径，不将模拟成功扩写为全部动作质量已验收。

性能仅单次基线：4500 UTF-16 单元插入至保存 835ms（含 700ms debounce），基础分页
140ms、4 页；没有多设备、长文分位数或性能提升结论。真实调用用量由服务报告，未核算费用。

本轮申请表、联系方式、截图、视频、PDF 与导出 DOCX 仅保存在忽略路径；未提交基金
申请，未上传这些媒体，未创建 GitLink 镜像。外部用户、商业化与旧素材授权不推测。
