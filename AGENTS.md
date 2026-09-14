# Kaiwu System Web Agent Contract

- 禁止直接在 `main` 等受保护分支实现；保留调用者当前分支，必要时创建描述性 feature/fix 分支。
- 不得用前端隐藏替代后端授权。
- 19 位 ID 一律使用字符串。
- 登录跑通前不增加范围外页面。
- 每次变更运行 typecheck 和生产构建。
