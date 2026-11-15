# Kaiwu 端到端验收

测试同时包含真实服务验收和模拟接口的 UI 回归。先启动目标前端，再按本次验证范围选择测试文件。
默认地址是 `http://127.0.0.1:8000`，可通过 `E2E_BASE_URL` 修改。

| 测试文件 | 覆盖范围 | 所需配置 |
| --- | --- | --- |
| `auth.spec.ts` | 未登录跳转、登录表单校验 | 可访问的前端 |
| `readonly-pages.spec.ts`、`read-api.spec.ts` | 工作台、用户、组织、安全运营、项目、配置、字典、模型、存储、项目工厂及读取接口 | `E2E_ADMIN_PASSWORD` |
| `mutations-api.spec.ts` | 用户、项目、成员、角色、菜单、配置、字典写入 | 管理员凭据与 `E2E_ALLOW_MUTATIONS=true` |
| `generation-api.spec.ts` | 基础脚手架、两个 ZIP 下载、同项目重复生成拒绝 | 额外设置 `E2E_ALLOW_GENERATION=true` |

变更与生成用例会创建数据，项目生成是一次性操作。请使用可重置的隔离测试环境和专用管理员账号。
凭据写入本机被 Git 忽略的 `.env.e2e`，首次可复制模板：

```bash
cp .env.e2e.example .env.e2e
pnpm exec playwright install chromium
```

Playwright 通过 dotenv 加载环境文件，需显式指定 `.env.e2e`。只验收登录表单时运行：

```bash
DOTENV_CONFIG_PATH=.env.e2e pnpm test:e2e auth.spec.ts
```

配置管理员凭据后运行只读验收：

```bash
DOTENV_CONFIG_PATH=.env.e2e pnpm test:e2e readonly-pages.spec.ts read-api.spec.ts
```

在隔离环境准备好全部授权后，可运行整个套件：

```bash
DOTENV_CONFIG_PATH=.env.e2e pnpm test:e2e
```

未指定测试文件会运行全部套件。真实服务用例缺少凭据或相应写入许可时会失败，并列出缺失项。

其他 UI 回归用例在测试文件中使用 `page.route` 提供模拟接口，验证布局、交互、拒绝和错误反馈。
测试报告应注明使用了真实服务还是模拟接口。模型连通性及业务项目的实际接入另需配套服务验收。
运行 `pnpm test:e2e:report` 查看 HTML 报告。
