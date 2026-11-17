# Security Policy

## Supported versions

项目尚处于 `0.x` 阶段。安全修复只保证合入最新开发版本；首个稳定版本发布后再维护明确的支持矩阵。

## Reporting a vulnerability

请使用仓库托管平台的私密漏洞报告功能联系维护者，不要创建公开 Issue，也不要附带真实生产凭据或
个人数据。报告应包含受影响版本、复现条件、影响评估和建议修复方式。

维护者会尽快确认报告，在完成修复和发布安排前与报告者协调披露时间。未获得明确许可前请勿公开
漏洞细节。

## Dependency audit exceptions

依赖变更时单独运行 `pnpm audit:prod`，它执行 `pnpm audit --prod --audit-level high`。只有**暂无修复版本**、且只出现在构建工具链
（不进入浏览器产物）的公告才允许豁免，与 CI 中 Trivy 的 `--ignore-unfixed` 策略一致。豁免写在
`package.json` 的 `pnpm.auditConfig.ignoreGhsas`，必须与生成项目前端模板保持一致（`pnpm check:security-pins`）。

| 公告 | 依赖路径 | 加入日期 | 原因 | 何时移除 |
|---|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm（braces ≤3.0.3） | `@umijs/utils > chokidar > braces`（开发期文件监听） | 2026-10-06 | 上游暂无修复版本，只在构建/开发服务器中运行 | braces 发布修复版本后改为钉版并删除豁免 |

有修复版本的公告一律通过 `pnpm.overrides` 钉到修复版本，不加豁免。

