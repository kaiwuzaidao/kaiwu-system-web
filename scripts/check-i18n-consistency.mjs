import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadI18nSqlCatalog, placeholders } from './i18n/i18n-sql.mjs';
import {
  checkStaticMessageKeys,
  checkVisibleHardcoding,
  collectStringPropertyKeys,
  collectUiFiles,
} from './i18n/i18n-ui-ast.mjs';

const ROOT = process.cwd();
const PRIMARY = 'zh-CN';
const SECONDARY = 'en-US';
const SERVICE_ROOT = path.join(ROOT, '..', 'kaiwu-system-service');
const MIGRATED_UI_FILES = [
  ...collectUiFiles(ROOT, 'src/components'),
  ...collectUiFiles(ROOT, 'src/pages'),
];

function fail(message) {
  console.error(`[check:i18n] ${message}`);
  process.exitCode = 1;
}

// 四个仓库各自独立，单独 clone 前端时后端不在旁边（CI 就是这种单仓检出）。
// 此时目录校验没有数据来源，跨仓部分整体跳过，只保留仓内自洽的检查：
// UI 文件里不得出现可见硬编码文案。
// 不能直接读目录然后崩在 ENOENT 上——那会让 CI 的 verify 永远无法通过。
if (!fs.existsSync(path.join(SERVICE_ROOT, 'sql', 'increment'))) {
  console.log(`[check:i18n] 跳过跨仓目录校验：未找到后端 SQL 目录 ${SERVICE_ROOT}/sql/increment`);
  for (const filepath of MIGRATED_UI_FILES) {
    checkVisibleHardcoding(ROOT, filepath, fail);
  }
  if (!process.exitCode) {
    console.log(`[check:i18n] ${MIGRATED_UI_FILES.length} 个 UI 文件无可见硬编码。`);
  }
  process.exit(process.exitCode ? 1 : 0);
}

const {
  migrationPaths,
  snapshotKeys,
  activeCatalogRows,
  activePrimaryCatalog,
  activeSecondaryCatalog,
  generatedButtonMigrationKeys,
  generatedButtonSnapshotKeys,
  checkedKeys,
} = loadI18nSqlCatalog({
  serviceRoot: SERVICE_ROOT,
  primary: PRIMARY,
  secondary: SECONDARY,
  fail,
});

function checkRescueBundleIsAnonymouslyServable() {
  const rescuePath = path.join(ROOT, 'src/i18n/rescue.ts');
  const publicKeys = new Set(
    [...activeCatalogRows.values()].filter((row) => row.publicVisible).map((row) => row.key),
  );
  if (publicKeys.size === 0) {
    fail('sql/schema.sql 未解析到任何 public_visible 资源，救援包校验失效');
    return;
  }
  for (const key of collectStringPropertyKeys(rescuePath)) {
    if (!key.includes('.')) continue;
    if (!snapshotKeys.has(key)) {
      fail(`救援包 key 在数据库资源中不存在：${key}`);
    } else if (!publicKeys.has(key)) {
      fail(`救援包 key 未开放匿名下发（public_visible=0），登录页会永远使用静态文案：${key}`);
    }
  }
}

function checkApiErrorMessageKeys() {
  const backendSrc = path.join(SERVICE_ROOT, 'kaiwu-system-domain/src/main/java');
  if (!fs.existsSync(backendSrc)) {
    fail('未找到后端源码目录，错误码资源校验失效');
    return 0;
  }
  const usages = [];
  const files = fs
    .readdirSync(backendSrc, { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.java'));
  for (const name of files) {
    const source = fs.readFileSync(path.join(backendSrc, name), 'utf8');
    for (const match of source.matchAll(/"(api\.[A-Za-z0-9_.]+)"/gu)) {
      const statementStart = source.lastIndexOf(';', match.index) + 1;
      const statementEnd = source.indexOf(';', match.index);
      const statement = source.slice(statementStart, statementEnd < 0 ? undefined : statementEnd);
      usages.push({
        key: match[1],
        file: name,
        line: source.slice(0, match.index).split('\n').length,
        thrown: /\bnew (?:Api|AuthFailure)Exception\(|\bResult\.error\(/u.test(statement),
        args: new Set(
          [...statement.matchAll(/\bMap\.of\(([\s\S]*)/gu)]
            .flatMap((call) => [...call[1].matchAll(/"([A-Za-z][A-Za-z0-9_]*)"\s*,/gu)])
            .map((argument) => argument[1]),
        ),
      });
    }
  }
  if (usages.length === 0) {
    fail('后端源码未解析到任何 api.* 错误码，错误码资源校验失效');
    return 0;
  }
  const reportedKeys = new Set();
  for (const usage of usages) {
    const where = `${usage.file}:${usage.line}`;
    if (!activePrimaryCatalog.has(usage.key)) {
      if (!reportedKeys.has(usage.key))
        fail(`${PRIMARY} 缺少 ENABLED 后端错误码 key：${usage.key}（${where}）`);
      reportedKeys.add(usage.key);
      continue;
    }
    if (!activeSecondaryCatalog.has(usage.key)) {
      if (!reportedKeys.has(usage.key))
        fail(`${SECONDARY} 缺少 ENABLED 后端错误码 key：${usage.key}（${where}）`);
      reportedKeys.add(usage.key);
      continue;
    }
    if (!usage.thrown) continue;
    const missing = placeholders(activePrimaryCatalog.get(usage.key)).filter(
      (name) => !usage.args.has(name),
    );
    if (missing.length > 0) {
      fail(`后端错误码 ${usage.key} 的抛出点未提供 messageArgs：${missing.join('、')}（${where}）`);
    }
  }
  return new Set(usages.map((usage) => usage.key)).size;
}

function checkDictionaryCoverage() {
  const fallbackSource = fs.readFileSync(path.join(ROOT, 'src/dictionaries/fallback.ts'), 'utf8');
  const dictionaries = new Map();
  for (const match of fallbackSource.matchAll(/'([^']+)'\s*:\s*([A-Z][A-Z0-9_]*)/gu)) {
    dictionaries.set(match[2], match[1]);
  }
  for (const filename of fs.readdirSync(path.join(ROOT, 'src/dictionaries'))) {
    if (!filename.endsWith('.ts') || filename === 'fallback.ts') continue;
    const content = fs.readFileSync(path.join(ROOT, 'src/dictionaries', filename), 'utf8');
    for (const match of content.matchAll(
      /export const ([A-Z][A-Z0-9_]*)[^=]*=\s*\[([\s\S]*?)\];/gu,
    )) {
      const dictCode = dictionaries.get(match[1]);
      if (!dictCode) continue;
      for (const item of match[2].matchAll(/value\s*:\s*'([^']+)'/gu)) {
        const key = `dict.${dictCode}.${item[1]}`;
        if (!activePrimaryCatalog.has(key)) fail(`${PRIMARY} 缺少 ENABLED 内置字典 key：${key}`);
        if (!activeSecondaryCatalog.has(key))
          fail(`${SECONDARY} 缺少 ENABLED 内置字典 key：${key}`);
      }
    }
  }
}

function checkBuiltInDictionaryTypeCoverage() {
  const builtInCodes = [
    'ai.test.status',
    'common.boolean_enabled',
    'common.status',
    'common.tag_color',
    'config.value.type',
    'gitlab.test.status',
    'notification.type',
    'platform.locale',
    'platform.menu.type',
    'project.generation.mode',
    'project.generation.status',
    'project.health.verdict',
    'project.member.status',
    'project.repository.push.status',
    'project.status',
    'scheduler.execution.status',
    'security.login.status',
    'security.session.status',
    'user.status',
  ];
  for (const dictCode of builtInCodes) {
    const key = `dictType.${dictCode}`;
    if (!activePrimaryCatalog.has(key)) fail(`${PRIMARY} 缺少 ENABLED 内置字典类型 key：${key}`);
    if (!activeSecondaryCatalog.has(key))
      fail(`${SECONDARY} 缺少 ENABLED 内置字典类型 key：${key}`);
  }
}

function checkMenuCoverage() {
  const insertBlocks = (sql, table) =>
    [
      ...sql.matchAll(
        new RegExp(String.raw`INSERT\s+(?:IGNORE\s+)?INTO\s+${table}\b([\s\S]*?);\n`, 'gu'),
      ),
    ].map((match) => match[1]);
  const routes = new Set();
  const inlineTranslated = new Set();
  const menuKeys = new Set();
  const buttonPermissions = new Set();
  const legacyPermissions = new Set();
  for (const migrationPath of migrationPaths) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    for (const match of sql.matchAll(/'(menu\.system\.[A-Za-z0-9_.-]+)'/gu)) {
      menuKeys.add(match[1]);
    }
    for (const block of insertBlocks(sql, 'sys_project_menu')) {
      const blockRoutes = [...block.matchAll(/'(\/[a-z0-9/-]*)'/gu)].map((match) => match[1]);
      blockRoutes.forEach((route) => routes.add(route));
      for (const match of block.matchAll(/'(system:[a-z0-9-]+:[a-z0-9-]+)'/gu)) {
        buttonPermissions.add(match[1]);
      }
      if (/'\{"[A-Za-z-]+":/u.test(block)) {
        blockRoutes.forEach((route) => inlineTranslated.add(route));
      }
    }
    for (const block of insertBlocks(sql, 'sys_menu')) {
      for (const match of block.matchAll(/'(\/[a-z0-9/-]*)'/gu)) routes.add(match[1]);
      for (const match of block.matchAll(/'(system:[a-z0-9-]+:[a-z0-9-]+)'/gu)) {
        legacyPermissions.add(match[1]);
      }
    }
    for (const match of sql.matchAll(
      /UPDATE sys_menu\b[^;]*?route_path\s*=\s*'(\/[a-z0-9/-]*)'/gu,
    )) {
      routes.add(match[1]);
    }
  }
  const bootstrap = path.join(
    SERVICE_ROOT,
    'kaiwu-system-domain/src/main/java/com/kaiwu/module/project/SystemProjectBootstrap.java',
  );
  if (!fs.existsSync(bootstrap)) {
    fail('未找到 SystemProjectBootstrap，内置菜单覆盖校验失效');
    return 0;
  }
  const bootstrapSource = fs.readFileSync(bootstrap, 'utf8');
  const mapperPath = path.join(
    SERVICE_ROOT,
    'kaiwu-system-domain/src/main/java/com/kaiwu/module/project/mapper/SystemBootstrapMapper.java',
  );
  if (!fs.existsSync(mapperPath)) {
    fail('未找到 SystemBootstrapMapper，legacy 菜单导入规则校验失效');
    return 0;
  }
  const mapperSource = fs.readFileSync(mapperPath, 'utf8');
  const excludedPermissions = new Set(
    [...mapperSource.matchAll(/permission_code\s*<>\s*'(system:[a-z0-9-]+:[a-z0-9-]+)'/gu)].map(
      (match) => match[1],
    ),
  );
  const excludedPermissionPrefixes = [
    ...mapperSource.matchAll(/permission_code\s+NOT LIKE\s+'(system:[a-z0-9-]+:)%'/gu),
  ].map((match) => match[1]);
  for (const permission of legacyPermissions) {
    if (
      !excludedPermissions.has(permission) &&
      !excludedPermissionPrefixes.some((prefix) => permission.startsWith(prefix))
    ) {
      buttonPermissions.add(permission);
    }
  }
  for (const match of bootstrapSource.matchAll(/"MENU",\s*\n?\s*"(\/[^" ]*)"/gu)) {
    routes.add(match[1]);
  }
  routes.delete('/roles');
  routes.delete('/menus');
  for (const match of bootstrapSource.matchAll(/"(system:[a-z0-9-]+:[a-z0-9-]+)"/gu)) {
    buttonPermissions.add(match[1]);
  }

  const required = new Set(['menu.system.directory.platform', 'menu.system.directory.delivery']);
  for (const route of routes) {
    if (!inlineTranslated.has(route)) {
      required.add(
        route === '/' ? 'menu.system.home' : `menu.system.${route.slice(1).replaceAll('/', '.')}`,
      );
    }
  }
  if (routes.size === 0) fail('未解析到任何内置菜单路由，菜单覆盖校验失效');
  for (const key of required) {
    if (!menuKeys.has(key))
      fail(`内置菜单缺少翻译来源（既无 ${key} 资源，也无内联 menu_name_i18n）`);
    if (!activePrimaryCatalog.has(key)) fail(`${PRIMARY} 缺少 ENABLED 内置菜单 key：${key}`);
    if (!activeSecondaryCatalog.has(key)) fail(`${SECONDARY} 缺少 ENABLED 内置菜单 key：${key}`);
  }
  if (buttonPermissions.size === 0) {
    fail('未解析到任何内置 BUTTON 权限码，按钮菜单覆盖校验失效');
  }
  // 迁移 SQL 里出现的权限码不全是"声明"：自举导入语句的 WHERE 子句会用
  // `permission_code <> 'system:user:assign-role'` 这类条件把某些按钮排除在
  // system 项目之外。按出现即声明来理解，会把被排除的按钮也要求配翻译资源。
  // 这里复用上面已从 Mapper 解析出的排除规则，与 legacyPermissions 的处理保持一致。
  const expectedButtonKeys = new Set(
    [...buttonPermissions]
      .filter(
        (permission) =>
          !excludedPermissions.has(permission) &&
          !excludedPermissionPrefixes.some((prefix) => permission.startsWith(prefix)),
      )
      .map((permission) => `menu.system.permission.${permission.replaceAll(':', '.')}`),
  );
  for (const key of generatedButtonMigrationKeys) {
    if (!expectedButtonKeys.has(key)) fail(`按钮资源没有对应的内置权限：${key}`);
  }
  for (const key of expectedButtonKeys) {
    if (!menuKeys.has(key) && !generatedButtonMigrationKeys.has(key))
      fail(`内置按钮缺少翻译来源：${key}`);
    if (!activePrimaryCatalog.has(key) && !generatedButtonSnapshotKeys.has(key))
      fail(`${PRIMARY} 缺少 ENABLED 内置按钮 key：${key}`);
    if (!activeSecondaryCatalog.has(key) && !generatedButtonSnapshotKeys.has(key))
      fail(`${SECONDARY} 缺少 ENABLED 内置按钮 key：${key}`);
  }
  return routes.size + 2 + expectedButtonKeys.size;
}

for (const filepath of MIGRATED_UI_FILES) {
  checkVisibleHardcoding(ROOT, filepath, fail);
  checkStaticMessageKeys(
    ROOT,
    filepath,
    PRIMARY,
    SECONDARY,
    activePrimaryCatalog,
    activeSecondaryCatalog,
    fail,
  );
}
checkDictionaryCoverage();
checkBuiltInDictionaryTypeCoverage();
checkRescueBundleIsAnonymouslyServable();
const checkedMenus = checkMenuCoverage();
const checkedApiKeys = checkApiErrorMessageKeys();

if (!process.exitCode) {
  console.log(
    `[check:i18n] 迁移资源 ${checkedKeys} 个，快照最终 ENABLED catalog 的 ${PRIMARY} / ${SECONDARY} 一致：${activePrimaryCatalog.size} 个 key；` +
      `${checkedMenus} 条内置菜单有翻译来源；${checkedApiKeys} 个后端错误码有资源；` +
      `救援包全部可匿名下发；${MIGRATED_UI_FILES.length} 个 UI 文件无可见硬编码。`,
  );
}
