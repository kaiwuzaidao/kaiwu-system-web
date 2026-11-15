# Contributing to Kaiwu System Web

感谢参与 Kaiwu。提交变更前请先创建 Issue 说明问题或设计，安全漏洞请遵循
[SECURITY.md](SECURITY.md)，不要公开披露。

## 开发流程

1. 从最新开发分支创建短生命周期分支。
2. 保持提交聚焦，不提交密钥、内部地址、`dist` 或无关格式化。
3. 执行 `pnpm verify`，按 [E2E 指引](tests/e2e/README.md)运行相关浏览器测试。依赖变更另运行 `pnpm audit:prod`。
4. 提交 Pull Request，并附上界面变化截图、测试结果和兼容性说明。

页面状态优先使用后端字典契约；权限入口必须同时满足菜单可见性与服务端授权。
