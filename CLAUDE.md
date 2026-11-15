# Kaiwu System Web 开发约定

先读本次需求、System 仓的[架构说明](https://github.com/kaiwuzaidao/kaiwu-system-service/blob/v0.2.0/docs/ARCHITECTURE.md)和[ADR 0003](https://github.com/kaiwuzaidao/kaiwu-system-service/tree/v0.2.0/docs/adr)。

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
  格式、构建与许可证。依赖变更时另运行 `pnpm audit:prod`，
  它通过外部漏洞库检查 High 及以上公告。公开 GitHub CI 的具体步骤见 [.github/workflows/ci.yml](.github/workflows/ci.yml)。
