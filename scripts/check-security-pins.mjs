#!/usr/bin/env node
/**
 * 校验平台前端与生成项目前端模板的依赖安全钉版一致。
 *
 * 两边用的是同一套 Umi 工具链，公告往往同时命中两边；只改一边，另一边的 CI 或新生成的项目
 * 就会在审计里失败（2026-09-30 起一周内四次）。这里要求：
 *   - 两边都钉了的包（pnpm.overrides）版本完全一致；
 *   - 平台前端钉了、生成模板的锁文件里也有的包，模板也必须钉；
 *   - 审计豁免（pnpm.auditConfig.ignoreGhsas）完全一致，豁免原因记录在 SECURITY.md。
 *
 * 退出码：0 一致或无法比对（后端仓库不在旁边）；1 发现不一致。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = process.env.KAIWU_SERVICE_DIR
  ? resolve(process.env.KAIWU_SERVICE_DIR)
  : resolve(webRoot, '../kaiwu-system-service');
const templateFile = resolve(
  serviceDir,
  'kaiwu-system-domain/src/main/resources/templates/project/frontend/package.json.ftl',
);

if (!existsSync(templateFile)) {
  console.log(`[check:security-pins] 跳过：未找到生成模板 ${templateFile}`);
  process.exit(0);
}

const web = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf8')).pnpm ?? {};
// 模板里只有 ${...} 插值，替换成占位值即可按 JSON 解析。
const template =
  JSON.parse(readFileSync(templateFile, 'utf8').replace(/\$\{[^}]+\}/g, 'placeholder')).pnpm ?? {};

const templateLock = readFileSync(resolve(dirname(templateFile), 'pnpm-lock.yaml.ftl'), 'utf8');
const problems = [];
const webPins = web.overrides ?? {};
const templatePins = template.overrides ?? {};
for (const [name, version] of Object.entries(webPins)) {
  if (name in templatePins) {
    if (templatePins[name] !== version) {
      problems.push(`${name}：平台前端 ${version}，生成模板 ${templatePins[name]}`);
    }
  } else if (version !== '-' && !name.includes('>') && templateLock.includes(`\n  ${name}@`)) {
    problems.push(`${name}：平台前端钉在 ${version}，生成模板也依赖它但没有钉版`);
  }
}

const ignored = (config) => [...(config.auditConfig?.ignoreGhsas ?? [])].sort().join(', ');
if (ignored(web) !== ignored(template)) {
  problems.push(`审计豁免不一致：平台前端 [${ignored(web)}]，生成模板 [${ignored(template)}]`);
}

if (problems.length > 0) {
  console.error('[check:security-pins] 平台前端与生成项目模板的依赖安全钉版不一致：');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('请两边同批修改；模板的 pnpm-lock.yaml.ftl 需同步更新。');
  process.exit(1);
}

const shared = Object.keys(webPins).filter((name) => name in templatePins).length;
console.log(
  `[check:security-pins] 一致：${shared} 个共同钉版，审计豁免 [${ignored(web) || '无'}]。`,
);
