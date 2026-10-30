# 来源记录

旧项目的审计基线、逐模块判定与禁止清单见 [docs/AUDIT.md](docs/AUDIT.md)。
旧项目迁移文件清单为空；新项目在独立目录重新实现，没有旧 Git 历史。不能据此
重新授权旧仓库或承诺旧仓库无第三方衍生代码。

本目录新编写的应用源码、测试及说明拟以 Apache-2.0 许可发布；不覆盖任何外部
依赖、系统字体或用户上传。公开前维护者应确认其有权发布本次新作，核验依赖
清单及对应上游许可。没有代替未知权利人作出授权声明，也没有执行公开发布。

`examples/` 和测试 fixtures 均为本次人工构造的合成内容，不是真实机关文件、
客户资料或历史聊天。应用不附带字体；截图和性能测量所用字体须另外记录。

依赖来源为 npm/PyPI 的对应公开版本；版本与完整性见 `frontend/pnpm-lock.yaml`
和 `backend/uv.lock`，许可和项目主页见 `THIRD_PARTY_NOTICES.md` 与生成的清单。

`frontend/AGENTS.md` 的 Next.js 规则块由 Next 16.4.1 的 `next dev` 自动生成；
`next-env.d.ts` 和 `.next` 类型声明同样由 Next 生成并忽略。它们不属于旧项目迁移，
也不计作自研编辑能力；其上游许可与 Next 的 bundled notices 一并保留。
