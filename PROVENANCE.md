# 来源记录

旧项目的审计基线、逐模块判定与禁止清单见 [docs/AUDIT.md](docs/AUDIT.md)。
旧项目迁移文件清单为空；新项目在独立目录重新实现，没有旧 Git 历史。不能据此
重新授权旧仓库或承诺旧仓库无第三方衍生代码。

本目录新编写的应用源码、测试及说明拟以 Apache-2.0 许可发布；不覆盖任何外部
依赖、系统字体或用户上传。公开前维护者应确认其有权发布本次新作，核验依赖
清单及对应上游许可。没有代替未知权利人作出授权声明；开发代码按维护者明确授权
推送至 `WEIXILIN0307/wenyuan`，不代表正式版本发布或未完成人工验收已经通过。

`examples/` 和测试 fixtures 均为本次人工构造的合成内容，不是真实机关文件、
客户资料或历史聊天。应用不附带字体；截图和性能测量所用字体须另外记录。

依赖来源为 npm/PyPI 的对应公开版本；版本与完整性见 `frontend/pnpm-lock.yaml`
和 `backend/uv.lock`，许可和项目主页见 `THIRD_PARTY_NOTICES.md` 与生成的清单。

`frontend/AGENTS.md` 的 Next.js 规则块由 Next 16.4.1 的 `next dev` 自动生成；
`next-env.d.ts` 和 `.next` 类型声明同样由 Next 生成并忽略。它们不属于旧项目迁移，
也不计作自研编辑能力；其上游许可与 Next 的 bundled notices 一并保留。

本轮模板 `backend/wenyuan/presets.py` 与其示例文字为新编写的合成内容，只参考旧业务能力，
没有复制旧模板、代码、字体或图片。规则检查使用 Python 标准库 `datetime` 和字面格式校验。
本轮未新增运行/开发依赖；本地填表使用环境已有 python-docx（MIT），录像/检查使用系统
FFmpeg、LibreOffice、Xvfb，不打包这些工具或字体进入源码/发行物。维护者授权消费旧部署
模型做合成验收，该授权不视为模型权重再分发许可，仓库不含权重或旧模型密钥。

界面调整参考旧项目 `frontend/components/writer/OfficeWriterWorkspace.tsx` 的三栏布局、
侧栏收起交互，以及 `frontend/app/(main)/layout.tsx` 的导航层级。该轮文渊的 JSX、CSS 与侧栏按钮图形在本仓库独立编写，未复制旧组件、样式文件或素材。

后续四界面扩展还参考旧项目知识库、模板目录、知识问答与 AgentSidebar 的信息布局。
本次新增 AppNavigation、KnowledgePage、TemplateLibrary、Knowledge 存储模块及测试均在
文渊独立实现，未复制旧模板内容、对话或知识库数据。详细路径和范围见
[四界面对照](docs/PRODUCT_SURFACES.md)。新增 SQLite 表与索引复用不引入额外依赖。

2026-10-31 按维护者要求进一步对齐公文智写界面：参考旧项目提交 `4731fb8` 的
布局、颜色、尺寸与信息层级，独立改写文渊界面，不迁移旧业务组件或 Office 引擎。
对照时使用隔离的旧前端及合成 API 响应，未读取旧客户知识库或会话。
新增公开依赖 `lucide-react@0.562.0`，用于与参考界面一致的通用线条图标；
其 ISC 及随包 Feather MIT 文字已保留在第三方清单与 notices，不计作自研图形。
模板内容仍为文渊的四种原创预设，未复制旧模板、字体或图片。
