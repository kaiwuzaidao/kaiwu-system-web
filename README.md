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
