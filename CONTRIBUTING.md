# 参与开发

请先阅读 README、PROVENANCE 与格式矩阵。所有测试资料必须为合成内容或明确可公开
使用的资料；不要提交用户文稿、账号、令牌、密钥、日志、字体、Office 制品或旧 Git。

修改文档模型或事务时同步 `docs/PROTOCOL.md`，修改格式范围时同步兼容矩阵；新增
依赖须固定版本、更新锁文件并重建 notices。浏览器恢复稿不能变成第二个正文服务端。
增加 AI 能力时仍必须先提案后确认、校验 revision 和目标 hash，不增加隐式 DOM 写入。

```bash
backend/.venv/bin/ruff check backend/wenyuan backend/tests scripts
backend/.venv/bin/ruff format backend/wenyuan backend/tests scripts
cd frontend
pnpm exec prettier --write app components lib tests '*.ts' '*.json'
```

后端/前端单测、浏览器、真实模型及 Office 人工检查分别记录；跳过或未运行必须直说。
CI 文件已提供，但本次尚未在远程托管平台运行；本地结果见 VALIDATION。

提交贡献意味着你有权贡献相应内容并同意按本项目许可发布；这不替代对旧项目或
第三方内容的授权确认。新功能保持单机可运行，优先简单的纯函数与明确依赖。
