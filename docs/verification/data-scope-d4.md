# Data Scope D4 验证记录（Web：角色「数据范围」页签）

依据：System 仓 `docs/DATA_SCOPE.md` §7–§8、设计稿 §6.4–§6.5。分支 `feat/data-scope-d4`，基于 `origin/dev`。
后端对照 `kaiwu-system-service` 的 `feat/data-scope-d1`（含本次新增的 V119）。

## 交付

- **角色授权弹窗**：项目 → 权限菜单 → 角色授权 → 行操作新增「数据范围」。原「分配菜单」弹窗改为带两个页签的
  `RoleGrantModal`（「菜单授权」「数据范围」），共用一个确定按钮，**只提交有改动的部分**，切页签不会丢另一边的修改。
  不新增页面。
- **数据范围页签**（`RoleDataScopeEditor`）：每个受控资源一行；下拉只列该资源 `allowedScopes`；未配置显示
  「仅本人（默认）」；选「指定部门」出现部门树多选（上限 128）与「含下级」开关，没选部门保存前拦截；选「全部」二次确认；
  估算 `ds` 超过 6144 字节时给出提示（只提示，不阻止保存）；内置 `project-admin` 只读，统一显示「全部（内置角色）」。
- **保存**：`PUT …/roles/{id}/data-scopes`，覆盖语义——只提交非「仅本人」的资源，「仅本人」等价于未配置。
- **配置移交**：计划里的 `DATA_SCOPE` / `ROLE_DATA_SCOPE` 条目走既有字典与分组（`ROLE_DATA_SCOPE` 属授权组，
  默认不勾选）。**修了一个会让条目消失的问题**：面板的「新增与更新」分组只收 `CREATE`/`UPDATE`，后端对重新出现的
  受控资源输出 `REENABLE`，会既不显示也不计数，现已纳入该分组。
- **字典与文案**：新增字典 `project.data_scope.type`（前端 fallback + 后端 seed），配置移交资源类型补
  `DATA_SCOPE`、`ROLE_DATA_SCOPE`，动作补 `REENABLE`；界面文案 27 条。后端放在 System 的
  **V119**（MySQL、达梦、helm 副本、`schema.sql` 同步，只新增），随 D1 分支提交。
- 按钮用 `AuthButton`，权限码 `system:project:role`，与后端（平台入口 `system:project:role`）一致，没有新增权限。

## 结果

- `pnpm verify`（对照 D1 后端 `KAIWU_SERVICE_DIR` + `KAIWU_SQL_DIR`）：类型、i18n、架构、日志、字典、权限、E2E 类型、
  格式、构建、许可证全部通过。
- Playwright（接口全部 `page.route` mock，文案取后端 `schema.sql`）：新增 `role-data-scope.spec.ts` 7 项、
  `config-handover.spec.ts` 增 1 项，连同该文件原有 4 项共 12 项通过。覆盖：加载与字典文案、下拉只列允许范围、
  覆盖语义保存、指定部门（空部门拦截、含下级、提交体）、「全部」确认与取消、内置角色只读且不发保存、无权限不可见、
  移交计划展示数据范围项且授权默认不执行。
- System `./scripts/verify.sh`（含 V119）：760 项，0 失败。
- 截图：[加载](data-scope-d4/01-loaded.png)、[指定部门未选](data-scope-d4/02-custom-dept-required.png)、
  [全部已确认](data-scope-d4/03-all-confirmed.png)、[内置角色只读](data-scope-d4/04-built-in-readonly.png)。

## 与提示词的差异

- 提示词写「缺部门的项标红且不可勾选」：契约 §7 已定为**整份计划 400 拒绝并一次列出全部问题**，
  不会出现「缺部门的计划项」，所以没有这类行；400 的错误文案沿用面板现有的 `message.error`。
- 「分配菜单」弹窗在没有任何改动时点确定，原先仍会调用一次授权接口，现在直接关闭（没有变化就不写）。
- 业务项目管理员入口（`/api/current/projects/{id}/access-admin/…`）在本仓没有页面，本次只接平台入口。

## 没有覆盖

- 没有对着真实后端联调（E2E 全 mock）；两仓字段按契约对齐，联调放在 D6。
- 部门树读取 `/api/org/departments`，需要组织架构读取权限；只有 `system:project:role` 而没有该权限的管理员
  会在加载时看到错误提示，指定部门无法选择。是否放宽要看权限设计。
- 其他语言（en-US）文案已随 V119 提供，没有逐页检查英文排版；`ja-JP` 未提供。
- 未做窄屏（移动宽度）检查：弹窗宽度固定 880，沿用原「分配菜单」弹窗。
