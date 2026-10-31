# 公文智写界面参考与验证（2026-10-30）

代码提交 `abab488bac6957d37410d5199e2f5c4198cbc463`，基线 `7d0aa65`。
本轮只调整工作台呈现与侧栏交互；编辑器、API、数据库、AI patch 和人工确认机制沿用原实现。

## 参考与实现

阅读旧项目的 `frontend/app/(main)/layout.tsx`、
`frontend/components/writer/OfficeWriterWorkspace.tsx`、`WriterContextPanel.tsx`、
`DocumentEditor.tsx` 和 `frontend/app/globals.css`。采用其文稿管理、正文编辑、
辅助面板三栏布局与可收起侧栏；文渊保持现有资料、历史和规则检查入口。

- 浅灰画布、白色独立面板、蓝色选中态；缩短重复标题，模型设置移到写作要求旁。
- 两侧面板可收起以扩大正文；保留编辑器实例、撤销记录和未发送要求。
- 面板按钮含名称、展开状态与目标标识；文稿和辅助入口标明当前项。

JSX、CSS 和侧栏按钮图形独立编写，未复制旧代码、字体、图标库、模板素材或 Office 组件，
未新增依赖。来源范围见 [PROVENANCE](../PROVENANCE.md)。

## 本地实际验证

Linux x86_64 共享主机；Python 3.12.13、Node 24.11.1、pnpm 10.17.1、
Chromium 148.0.7778.96、系统 Noto CJK 字体。
浏览器命令中的 `$WENYUAN_CHROMIUM` 实际设置为
`/home/songbinbin/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`。

| 命令或操作 | 实际结果 |
|---|---|
| `cd frontend && pnpm typecheck` | 通过 |
| `cd frontend && pnpm test` | 9 passed，0 失败/跳过 |
| `cd frontend && WENYUAN_CHROMIUM="$WENYUAN_CHROMIUM" pnpm test:e2e --output /var/tmp/wenyuan-pane-e2e` | 9 passed，1.1 分钟，0 跳过；真实 Next/FastAPI/SQLite/Chromium，成功 AI 用明确的 HTTP 测试模拟器 |
| `cd frontend && WENYUAN_BACKEND=http://127.0.0.1:8118 pnpm build` | 编译、类型检查、静态生成通过 |
| `pnpm start --port 3118` + Playwright | 1600×1000、1280×900 和两侧收起截图已实际生成并视觉核对 |
| Gitleaks 8.30.1 `dir`，对 Git 索引导出的源码快照扫描 | 0 findings；已跟踪文件未含私有媒体、表单或提供的电话/邮箱 |

新增浏览器用例检查面板收起后编辑区扩大、要求仍保留、撤销/重做可用。
原用例继续覆盖保存失败恢复、双标签冲突、导出回读、片段定位、预览确认及过期提案拒绝。
未修改后端，本地未重复执行后端整套测试；干净安装 CI 另行记录。

[GitHub Actions 41162330535](https://github.com/WEIXILIN0307/wenyuan/actions/runs/41162330535)
已在上述代码提交通过干净安装：Python 3.12 / Node 22，ruff 通过、后端
**62 passed / 5.33s**（1 条已有测试客户端弃用警告）、前端 **9 passed**、类型与生产构建
通过、浏览器 **9 passed / 1.1 分钟**。CI 模型为 HTTP 模拟器，不代替真实模型验证。

本轮中文输入法仍为 CDP 组合协议模拟，未新增系统输入法或 Word/WPS 人工验收。
4500 UTF-16 单元单次测量：输入至保存 841ms（含自动保存等待），打开分页 142ms、4 页；
不是跨设备性能结论。

## 本地材料与存储

`demo-materials` 保留仓库内原路径，实际链接到维护者允许的 `/data03` 中本账号可写目录；
完整本机路径记录于忽略的 `grant-private/storage-location.txt`。截图 17 为新版三栏工作台，
18 为正文专注编辑，19 为 1280 宽度。前版媒体另行归档，未删除其他项目文件。

使用新建隔离演示账号与合成资料，在生产模式真实浏览器中重新执行
`node grant-private/record-demo.cjs`；实际调用原授权的本地 qwen3.5-9b。
已完成模板创建、资料检索、查看发送内容、改写预览、引用回到原片段、确认写入、
人工编辑列表/表格、刷新恢复与 DOCX 导出。第一次录制在刷新后因两篇同名合成文稿
导致脚本定位不唯一而中断；保留旧稿，改用新隔离账号完成，不把中断片段计入演示。

`PYTHONPATH=backend backend/.venv/bin/python grant-private/check_export.py` 对本次
2717 字节 DOCX 独立回读通过：4 个标题、2 个列表项、3×3 表格逐格文字一致。

`node grant-private/post-demo.cjs` 复验真实模型 HTTP 404：界面显示错误，正文不变，
随后恢复原配置。`libreoffice --headless --convert-to pdf` 使用独立 profile 实际生成
1 页 A4 PDF，并核对文本与渲染截图；标题字形、项目符号和表头外观仍有已知差异。
本轮未重新进行 Office GUI 人工验收。

FFmpeg 加字幕封装后的 MP4 为 **151.28 秒 / 1600×1080 / H.264 / 3,885,903 字节**，
连续录制、无加速剪接；`python -S grant-private/check_media.py` 全片解码通过，
65s、110s 抽帧文字可读。未声称多播放器或维护者完整观看验收。

构建缓存 15,134 个普通文件逐字节核对后迁移；依赖链接按新路径调整。
隔离演示数据库在 API 停止期间复制校验，保留密钥文件权限。原路径均可继续使用，
迁移后 `pnpm typecheck` 与生产浏览器打开文稿、表格回读、侧栏、输入保留和脱敏模型配置
检查通过，没有重复调用模型。历史媒体保留在新存储目录，未删除其他项目文件。

表单、联系方式、模型配置、截图和录像均不进入 Git，也未上传第三方。
历史真实模型与兼容性范围见 [SEED_VALIDATION](SEED_VALIDATION.md)，
前轮文字精简与界面记录见 [UI_POLISH_VALIDATION](UI_POLISH_VALIDATION.md)。
