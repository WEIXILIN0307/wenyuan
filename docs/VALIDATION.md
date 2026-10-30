# 本地验证记录

日期：2026-10-30。仅使用新编写的合成资料与临时测试用户，未使用旧项目数据库、模型
配置、密钥、文稿或日志。本记录区分真实运行、模拟、协议模拟及尚未执行的人工验收。

## 已执行

| 类别 | 命令（项目根目录；注明处先 cd） | 实际结果 |
|---|---|---|
| 后端单元/API/模型传输模拟 | `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -p asyncio -q` | **57 passed**, 4.24s；1 条 Starlette/httpx 测试客户端弃用警告 |
| Python 静态检查 | `backend/.venv/bin/ruff check backend/wenyuan backend/tests scripts` | 通过 |
| TypeScript | `cd frontend && pnpm typecheck` | 通过 |
| 前端模型/历史/布局/保存队列单测 | `cd frontend && pnpm test` | **9 passed**；包括 60 次独立修改、完整撤销及重做 |
| 真实 Chromium + 真实 Next/FastAPI/SQLite | `cd frontend && pnpm test:e2e`（本机通过 `WENYUAN_CHROMIUM` 指定已有浏览器） | **7 passed**, 55.5s；实际浏览器 60 次撤销/重做与跨段替换通过；AI 成功链路使用明确的测试 HTTP 模拟器 |
| 优化生产构建 | `cd frontend && pnpm build` | Next **16.4.1** webpack 编译、类型检查与静态页面生成成功 |
| DOCX 合成 fixtures | `backend/.venv/bin/python scripts/generate_fixtures.py` | JSON/PNG/DOCX 已生成，导出时结构回读通过 |
| 真实 LibreOffice 自动兼容检查 | `bash scripts/check_office.sh` 所列等价命令 | LibreOffice **7.3.7.2** 已打开合成 DOCX 并转为 PDF；1 页 A4，提取到标题/正文/列表/表格文字，视觉结果见下方 |
| npm 生产依赖公告 | `cd frontend && pnpm audit --prod` | 0 条已知漏洞（仅表示当时公告库扫描结果） |
| Python 运行时公告 | `uv export --locked --no-dev --no-emit-project --no-hashes -o /tmp/wenyuan-runtime-requirements.txt`，再 `uvx pip-audit --disable-pip --no-deps -r /tmp/wenyuan-runtime-requirements.txt` | No known vulnerabilities found；锁中依赖均已枚举，扫描用导出清单不替代带哈希 uv.lock |
| 依赖许可库存 | `backend/.venv/bin/python scripts/third_party.py`（本机另指定自定义 `--store-dir`） | 76 个已安装运行/开发依赖；保留 220 份随包 license/notice（含 bundled notices） |

后端覆盖 revision 冲突、并发双写、重复幂等 ID、回读、未知状态查询、错误回滚、
原文 hash、重复文本第二节点、UTF-16 emoji 边界、权限及删除级联；格式覆盖段落、
标题、列表、粗斜体/颜色/字号/链接、图片、表格的导入→编辑→导出→回读。安全覆盖
危险文件名、大小、路径穿越、压缩比、宏、DTD/外部实体、外部图片不抓取、模型 origin
限制、来源删除后的提案拒绝、密钥密文与掩码。模型错误覆盖超时、取消、截断、错误
JSON、错误引用、未配置服务、非 200 响应；这些是模拟传输，不是实际模型质量结论。

浏览器流程覆盖：创建/重命名/保存/刷新/导出、大纲和预览、断网保存异常及刷新恢复、
双标签冲突保留本地稿、真实剪贴板粘贴、图片和表格、资料上传/回读、未配置模型提示，
以及 HTTP 模拟器下的预览、拒绝、接受、重复原文定位与生成期间人工修改后的拒绝。
中文输入使用 Chromium CDP 的 imeSetComposition/insertText，明确属于输入法协议模拟。

## 实测环境与基线

- Linux x86_64，Intel Xeon Gold 6226R @ 2.90GHz，64 logical CPUs，共享开发主机，
  没有隔离其他负载；Node 24.11.1、Python 3.12.13、pnpm 10.17.1。
- Chromium **148.0.7778.96** headless，1600×1000，系统 Noto Serif CJK SC；未分发字体。
- 开发模式已完成页面编译后，4500 UTF-16 单元合成长段：插入到自动保存完成 **816ms**，
  包含 700ms 自动保存 debounce；打开并显示分页预览 **185ms**，共 **4 页**。
- 上述为单次环境基线，不是 p95、生产 SLA 或性能收益证明。后续同环境回归观察目标为
  插入+保存 2s 内、预览 500ms 内；需多轮测量后再确定发布指标，不向其他设备外推。

## 发现和处理

- 旧仓库没有可据以再许可的根许可证，旧源码/模板/字体迁移白名单为空。
- 应用自身回读曾把字号 20 与 20.0 误判不等，改为语义数值比较并加入回归测试。
- 真实 LibreOffice 暴露 `.rels` 前缀命名空间检测不兼容；导出改用默认命名空间，
  最小与完整合成文件均可打开。说明自身回读不能替代独立 Office 检查。
- 首轮依赖公告扫描命中旧固定版本；升级 Next/PM View/React/diff/PostCSS、
  cryptography/Pillow，移除未使用 Sharp/libvips 和 JSDOM 后重新扫描与测试。
- `/data` 分区曾满导致 ENOSPC。仅将本次创建的 node_modules、.next、uv cache、
  venv 移到 `/tmp/wenyuan-build-*`，通过本地忽略的符号链接运行；未删除旧项目或其他
  用户文件。交付 Git 中不含这些链接/缓存；此会话依赖 `/tmp` 的运行环境不是持久部署。
- Starlette 目前提示测试客户端未来建议 httpx2；当前版本实际测试通过，未忽略测试。

## 未运行与发布门槛

| 项目 | 状态及下一步 |
|---|---|
| 真实模型 | **未运行**：未获得新项目可用模型配置与授权凭据；需配置真实服务，核对所有写作动作、引用质量、用量、超时取消与服务商告知 |
| 系统中文输入法 | **未人工运行**：CDP 模拟不能代替搜狗/微软拼音/IBus 等真实输入法；需检查候选框、组合提交和跨段操作 |
| Office 人工 GUI 兼容 | **未完成**：已做真实软件自动转换及本次 PDF 视觉检查，仍需人员在实际 Word/WPS/LibreOffice GUI 中打开、编辑、另存并签署差异记录 |
| 完整性能验收 | 单次 4500 单元基线已测，尚无多设备/字体/1万–10万字/多轮分位数结论 |
| 云端 CI | 文件已提供，尚未在远程平台执行；本次结果为本地实际运行 |
| 正式版本发布 | **未执行**：按维护者明确授权推送开发代码至 `WEIXILIN0307/wenyuan`；不创建正式 Release，仍需完成上述人工验收及目标平台许可核验 |

工作台截图：[真实浏览器](screenshots/workbench.png)。真实 Office PDF 栅格化结果：
[LibreOffice 渲染](screenshots/office-render.png)。这些材料都只包含合成测试文稿。
