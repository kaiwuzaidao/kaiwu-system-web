# Kaiwu System Web 开发约定

先读工作区需求、架构和 ADR 0003。

- 只使用 Umi Max、Ant Design 5 和 ProComponents；AI 对话界面另用 Ant Design X 1.x（兼容 antd 5，
  精确钉版）。升级 antd 6 时一并迁到 X 2。X 的 Conversations / Prompts 选项不可键盘操作，
  会话列表与示例问题保留自有按钮实现。
- `/api` 始终走 Gateway。
- 权限按钮必须使用与后端注解、menu.sql 相同的权限码。
- 用户可见、需要翻译或运营配置的状态和枚举必须走字典组件（`DictTag` / `DictSelect` + `useDict`），
  未知值原样展示。内部状态机、协议码、固定布尔逻辑和纯交互分支保留代码常量；
  受管枚举禁止在页面里写 `valueEnum` 或 value→label 本地映射；
  ProTable 的筛选项用 `fieldProps.options` 接 `useDict`，渲染用 `DictTag`。
- 新增字典必须前后端同批提交：后端 `sql/increment/V{n}__*.sql` seed（`scope_id=0`），
  前端 `src/dictionaries/` 补 fallback 并登记到 `DICT_FALLBACK`。
  「是否启用」类布尔字段一律复用 `common.boolean_enabled`，不要按模块另造 `xxx.enabled`。
- 改动后执行 `pnpm verify`，由同一入口运行类型、i18n、架构、日志、字典、权限、E2E 类型、
  格式、构建与许可证。High 级生产依赖审计（`pnpm audit:prod`）不在 `pnpm verify` 里：它依赖外部漏洞库，
  一有新公告就会让无关改动变红，CI 里由独立的 `audit` job 承担（MR 仅改依赖文件时阻塞，
  dev 只告警，每日定时扫描），改依赖时本地请单独执行 `pnpm audit:prod`。
