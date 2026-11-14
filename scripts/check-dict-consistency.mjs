#!/usr/bin/env node
/**
 * 校验前端 DICT_FALLBACK 的 dictCode 与后端 Flyway 增量里 seed 的 dict_code 一致。
 *
 * 存在的意义：useDict 在字典读取失败时会降级到本地 fallback，页面照常显示中文，
 * 所以「后端根本没 seed 这个字典」在运行时是看不出来的。这个脚本把它变成可检测的。
 *
 * 退出码：0 一致或无法比对（后端仓库不在旁边）；1 发现不一致。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 默认按四仓平级工作区定位后端；KAIWU_SQL_DIR 可覆盖（CI 或非标准布局）。
const sqlDir = process.env.KAIWU_SQL_DIR
  ? resolve(process.env.KAIWU_SQL_DIR)
  : resolve(webRoot, '../kaiwu-system-service/sql/increment');
const fallbackFile = join(webRoot, 'src/dictionaries/fallback.ts');
const pagesDir = join(webRoot, 'src/pages');
// 语言目录本身决定可扩展 locale，给它维护代码 fallback 会重新引入固定语言集合。
const databaseOnlyCodes = new Set(['platform.locale']);
// 后端仓 .publishignore 列出的迁移不随开源发布导出：那是某个部署自己的业务展示数据，
// 不是平台字典，前端不为它维护 fallback。
const unpublishedMigrations = readUnpublishedMigrations();

let failed = false;

/**
 * 检查二：页面里不允许出现硬编码的 valueEnum。
 *
 * ProTable 的 valueEnum 是绕开字典最常见的入口，而且它同时承担筛选项和渲染，
 * 一旦硬编码，字典改了页面不会跟着变。改用 fieldProps.options + DictTag。
 */
function checkHardcodedValueEnum() {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      readFileSync(full, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/\bvalueEnum\s*:/.test(line)) {
            offenders.push(`${relative(webRoot, full)}:${index + 1}`);
          }
        });
    }
  };
  if (existsSync(pagesDir)) walk(pagesDir);

  if (offenders.length > 0) {
    failed = true;
    console.error('[check:dict] 页面存在硬编码 valueEnum，请改用受管字典：');
    offenders.forEach((where) => console.error(`  - ${where}`));
    console.error(
      '  改法：fieldProps={{ options: useDict(code).options }} + <DictTag dictCode=... />',
    );
  }
}

checkHardcodedValueEnum();

if (!existsSync(sqlDir)) {
  // 四个仓库各自独立，单独 clone 前端时后端不在旁边，此时跳过前后端比对。
  console.log(`[check:dict] 跳过前后端比对：未找到后端 SQL 目录 ${sqlDir}`);
  process.exit(failed ? 1 : 0);
}

/** 从 fallback.ts 的 DICT_FALLBACK 字面量里取出所有 dictCode。 */
function readFrontendCodes() {
  const source = readFileSync(fallbackFile, 'utf8');
  const start = source.indexOf('DICT_FALLBACK');
  if (start < 0) {
    throw new Error(`未在 ${fallbackFile} 中找到 DICT_FALLBACK`);
  }
  const body = source.slice(start);
  return new Set([...body.matchAll(/^\s*'([a-z][a-z0-9._]*)':/gm)].map((match) => match[1]));
}

/**
 * 按 Flyway 版本顺序重放增量 SQL，得出最终存在的 dict_code 集合。
 *
 * 只在 sys_dict_type 语句内匹配，避免把 sys_app_config 之类同样是
 * `(id, scope, 'a.b.c', ...)` 形状的 seed 误当成字典。
 *
 * DELETE 必须和 INSERT 一起重放：功能下线时字典会被后续迁移删掉，只看 INSERT
 * 会把已下线的字典当成「后端有、前端缺」而永远报错。
 */
function readUnpublishedMigrations() {
  const ignoreFile = resolve(sqlDir, '../../.publishignore');
  if (!existsSync(ignoreFile)) return [];
  return readFileSync(ignoreFile, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(
      (pattern) =>
        new RegExp(
          `^${pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '\u0000')
            .replace(/\*/g, '[^/]*')
            .replace(/\u0000/g, '.*')}$`,
        ),
    );
}

function readBackendCodes() {
  const codes = new Set();
  const files = readdirSync(sqlDir)
    .filter((name) => name.endsWith('.sql'))
    // 按版本号数值排序：字典序会把 V10 排到 V2 前面，重放顺序就错了。
    .sort((a, b) => {
      const version = (name) => Number(/^V(\d+)__/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER);
      return version(a) - version(b) || a.localeCompare(b);
    });
  for (const file of files) {
    const sql = readFileSync(join(sqlDir, file), 'utf8');
    const unpublished = unpublishedMigrations.some((pattern) =>
      pattern.test(`sql/increment/${file}`),
    );
    for (const [block] of sql.matchAll(
      /INSERT\s+(?:IGNORE\s+)?INTO\s+`?sys_dict_type`?[\s\S]*?;/gi,
    )) {
      for (const row of block.matchAll(/\(\s*\d+\s*,\s*\d+\s*,\s*'([a-z][a-z0-9._]*)'/g)) {
        if (unpublished) databaseOnlyCodes.add(row[1]);
        else codes.add(row[1]);
      }
    }
    for (const [block] of sql.matchAll(/DELETE\s+FROM\s+sys_dict_type[\s\S]*?;/gi)) {
      for (const row of block.matchAll(/'([a-z][a-z0-9._]*)'/g)) {
        codes.delete(row[1]);
      }
    }
  }
  return codes;
}

const frontend = readFrontendCodes();
const backend = readBackendCodes();

const missingInBackend = [...frontend].filter((code) => !backend.has(code)).sort();
const missingInFrontend = [...backend]
  .filter((code) => !frontend.has(code) && !databaseOnlyCodes.has(code))
  .sort();

if (missingInBackend.length === 0 && missingInFrontend.length === 0) {
  console.log(`[check:dict] 前后端一致：${frontend.size} 个字典码对齐。`);
  process.exit(failed ? 1 : 0);
}

if (missingInBackend.length > 0) {
  console.error('[check:dict] 前端在用、后端没有 seed（页面会永远走本地硬编码）：');
  missingInBackend.forEach((code) => console.error(`  - ${code}`));
}
if (missingInFrontend.length > 0) {
  console.error('[check:dict] 后端已 seed、前端缺 fallback（后端不可用时会显示英文原值）：');
  missingInFrontend.forEach((code) => console.error(`  - ${code}`));
}
process.exit(1);
