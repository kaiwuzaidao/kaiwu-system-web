# Kaiwu System Web

Kaiwu 平台的管理前端：工作台、项目管理、项目工厂、用户与组织、权限菜单、字典、
参数配置、国际化资源、审计与安全运营。

> 这是 [Kaiwu](https://github.com/kaiwuzaidao/kaiwu) 的组成部分之一，不单独使用。
> 想先看平台整体，请从入口仓开始；那里有一条 `./kaiwu up` 的本地全链路。

技术栈固定为 `@umijs/max` + Ant Design 5 + ProComponents。

## 本地开发

需要 Node.js 22 和 `package.json` 指定的 pnpm 版本。先通过入口仓启动平台，确认 Gateway 可从本机 8088 端口访问。以下命令在本仓根目录执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开开发服务器终端打印的地址，默认是 <http://127.0.0.1:8000>。若平台前端已占用 8000，可改用 `PORT=8001 pnpm dev`。

**`/api` 必须经过 8088 的 Gateway，不得直连 System 的 8080。** 直连会绕过身份校验、
在线会话和项目成员判断，本地跑通的东西到了任何真实环境都会失败。

## 容器运行

Compose 与 Kubernetes 使用同一个镜像，切换环境不需要重新构建前端——
上游地址在运行时由 `KAIWU_GATEWAY_UPSTREAM` 注入，只接受 `host:port`，不含协议和路径：

先启动本地平台。默认 Compose 项目名为 `kaiwu`，对应网络为 `kaiwu_default`。独立前端容器加入同一网络后，可通过服务名访问 Gateway：

```bash
docker build -t kaiwu-system-web:local .
docker run --rm --network kaiwu_default -p 127.0.0.1:8001:8080 \
  -e KAIWU_GATEWAY_UPSTREAM=gateway-service:8088 \
  kaiwu-system-web:local
```

按实际部署替换网络名和 Gateway 的服务名。浏览器访问 <http://127.0.0.1:8001>。首次启动整个平台时可直接使用入口仓 `./kaiwu up`。

## 权限与导航

左侧导航按当前用户在 `system` 项目下的权限快照过滤，不是前端写死的菜单树。

权限码在**后端注解、前端按钮、菜单 SQL 三处必须完全一致**，由 `pnpm check:perm` 校验。
新增受权限保护的功能时，菜单 seed 要一并写进增量 SQL——只在运行库里手工建菜单不算数，
全新安装会缺这条权限，管理员无法把它授予任何角色。

角色与菜单没有顶层平行入口：内置的 `system` 项目负责平台成员、系统角色、平台菜单和
登录权限；其他项目的「权限中心」负责各自的成员、角色、授权和业务菜单树。

## 前端约定

- 需要翻译或运营配置的业务状态/枚举，通过 `DictTag` 展示，通过 `DictSelect` 和 `useDict` 提供选项，未知值原样显示。
  内部状态机、协议码和只参与分支判断的枚举保留代码常量。由 `pnpm check:dict` 校验。
- 19 位 ID 在前端和 JSON 契约中保持字符串，不要交给 `number`。
- `console` 不得输出凭据或敏感个人信息，由 `pnpm check:log` 校验——
  浏览器控制台会被录屏、被监控 SDK 采集。
- `src/app.tsx` 只能导出 Umi 运行时支持的键，工具函数放独立文件。

## 验证

```bash
pnpm verify
```

此命令覆盖类型、架构、i18n、权限、字典、日志、格式、构建和许可证检查。依赖安全审计单独运行 `pnpm audit:prod`，浏览器测试见 [E2E 指引](tests/e2e/README.md)。

跨仓检查默认读取同级的 `kaiwu-system-service`。使用其他目录时，同时设置 `KAIWU_SERVICE_DIR` 和 `KAIWU_SQL_DIR`，确保源码与 SQL 对应同一版本：

```bash
KAIWU_SERVICE_DIR=/path/to/kaiwu-system-service \
KAIWU_SQL_DIR=/path/to/kaiwu-system-service/sql/increment pnpm verify
```

后端不在本机时，相关脚本会提示跳过跨仓检查。公开 GitHub CI 当前执行安装、类型检查与构建，完整验证结果以本地 `pnpm verify` 和实际运行的浏览器测试为准。

## 参与开发

改动 UI 前请读 `CLAUDE.md`。Pull Request 请说明变更、风险与可直接执行的验证步骤。

## License

本项目基于 [Apache License 2.0](LICENSE) 开源。

## 工作台待办深链接

业务后端的 `kaiwu/configs.yml` 可声明项目级配置 `workspace.deep-links`，例如以下 JSON 值：

```json
{"version":1,"routes":[{"prefix":"/workflow/tasks","queryParameters":["taskId","tab"]}]}
```

此路径是示例，需由业务前端实现。待办先进入 `/workspace/{projectId}?route=...`，其中 `route` 编码一次。
宿主读取当前项目的白名单，按最长路径段前缀和精确参数名匹配。非法链接或配置读取失败时回到项目首页。
目标服务仍需校验任务归属和办理权限。

配置通过 CLI `project sync` 首次登记。后续修改已存在配置的当前值时，使用项目配置管理入口。
完整清单示例与匹配规则见[深链接说明](docs/verification/c2.md)。

## 后端服务登记

项目详情的后端服务面板支持查看、登记、修改地址和启停。页面使用 `system:project:list/update`
权限控制操作入口，System 还会校验目标项目的管理权限。加载返回 403 时隐藏写操作，保存失败时保留表单。

默认服务地址可清空，并与项目字段同步。其他服务要求规范原点 URI，且需要开启多服务功能。
管理员应在完成各服务配套升级后再启用多服务。

路由弹窗按服务生成带独立 audience 的片段，发布需通过部署流程完成。停用后，应撤销已发布的对应片段。
