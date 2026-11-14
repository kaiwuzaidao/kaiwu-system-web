# Kaiwu System Web

Kaiwu 平台的管理前端：工作台、项目管理、项目工厂、用户与组织、权限菜单、字典、
参数配置、国际化资源、审计与安全运营。

> 这是 [Kaiwu](https://github.com/kaiwuzaidao/kaiwu) 的组成部分之一，不单独使用。
> 想先看平台整体，请从入口仓开始；那里有一条 `./kaiwu up` 的本地全链路。

技术栈固定为 `@umijs/max` + Ant Design 5 + ProComponents。

## 本地开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://127.0.0.1:8000>。

**`/api` 必须经过 8088 的 Gateway，不得直连 System 的 8080。** 直连会绕过身份校验、
在线会话和项目成员判断，本地跑通的东西到了任何真实环境都会失败。

## 容器运行

Compose 与 Kubernetes 使用同一个镜像，切换环境不需要重新构建前端——
上游地址在运行时由 `KAIWU_GATEWAY_UPSTREAM` 注入，只接受 `host:port`，不含协议和路径：

```bash
docker run --rm -p 8000:8080 \
  -e KAIWU_GATEWAY_UPSTREAM=127.0.0.1:8088 \
  kaiwu-system-web
```

## 权限与导航

左侧导航按当前用户在 `system` 项目下的权限快照过滤，不是前端写死的菜单树。

权限码在**后端注解、前端按钮、菜单 SQL 三处必须完全一致**，由 `pnpm check:perm` 校验。
新增受权限保护的功能时，菜单 seed 要一并写进增量 SQL——只在运行库里手工建菜单不算数，
全新安装会缺这条权限，管理员无法把它授予任何角色。

角色与菜单没有顶层平行入口：内置的 `system` 项目负责平台成员、系统角色、平台菜单和
登录权限；其他项目的「权限中心」负责各自的成员、角色、授权和业务菜单树。

## 前端约定

- 需要翻译或运营配置的业务状态/枚举，一律通过 `DictionaryText` 展示，未知值原样显示。
  内部状态机、协议码和只参与分支判断的枚举保留代码常量。由 `pnpm check:dict` 校验。
- 19 位 ID 在前端和 JSON 契约中保持字符串，不要交给 `number`。
- `console` 不得输出凭据或敏感个人信息，由 `pnpm check:log` 校验——
  浏览器控制台会被录屏、被监控 SDK 采集。
- `src/app.tsx` 只能导出 Umi 运行时支持的键，工具函数放独立文件。

## 验证

```bash
pnpm verify
```

一条命令覆盖类型、架构、i18n、权限、字典、日志、格式、构建、许可证与依赖审计。
提交前跑它，CI 跑的是同一条。

## 参与开发

改动 UI 前请读 `CLAUDE.md`。Pull Request 请说明变更、风险与可直接执行的验证步骤。

## License

本项目基于 [Apache License 2.0](LICENSE) 开源。

### 工作台受管待办深链接（C2）

子应用通过本项目配置`workspace.deep-links`登记白名单，例如JSON值：

```json
{"version":1,"routes":[{"prefix":"/workflow/tasks","queryParameters":["taskId","tab"]}]}
```

来源scope必须等于当前项目ID，不继承全局白名单。待办链接先进入`/workspace/{projectId}?route=...`，route仅编码一次；
宿主重新读取当前项目配置，采用最长路径段前缀及精确参数名匹配。重复参数、跨项目projectId覆盖、外部URL、双重编码及未登记路由均不进入子路由。
配置失败时保留项目首页，旧的普通待办链接继续使用原导航规则。示例路由须由业务子应用实际实现，任务资源归属与办理权限仍由目标服务验证。
本分支仅功能集成，未合并dev、发布或部署；见[本步证据](docs/verification/workflow-platform-step3-c2-20261103/HANDOFF.md)。

### C1最小后端服务登记界面

项目详情中的后端服务面板支持查看、登记、修改地址及启停；既有`system:project:list/update`权限只控制按钮，
实际请求还须由System确认目标项目管理员。加载403时不显示写操作，保存失败保留表单并展示错误。
默认地址可清空并与原项目字段同步，非default要求规范原点；多服务开关默认关闭，尚未完成全副本升级时服务端会拒绝相应变更。
路由弹窗按服务展示独立audience的片段，不自动发布；停用后的已发布片段需另行撤销。本次保留C2深链接行为。
见[本步交接](docs/verification/workflow-platform-step4-c1-20261103/HANDOFF.md)。
