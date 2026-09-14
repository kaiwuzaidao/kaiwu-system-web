import fs from 'node:fs';
import path from 'node:path';

export function placeholders(message) {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

const unescapeSql = (value) => value.replaceAll("''", "'");

function splitSqlRow(line) {
  const start = line.indexOf('(');
  if (start < 0) return undefined;
  const args = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (let index = start; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === "'" && line[index + 1] === "'") {
        current += "''";
        index += 1;
      } else if (char === "'") {
        quoted = false;
        current += char;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'") {
      quoted = true;
      current += char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
    }
    if (char === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  return undefined;
}

function parseTranslations(expression) {
  const result = new Map();
  if (!expression || expression.toUpperCase() === 'NULL') return result;
  const inner = expression.match(/^JSON_OBJECT\((.*)\)$/su);
  if (!inner) return result;
  const parts = [...inner[1].matchAll(/'((?:''|[^'])*)'/gu)].map((match) => unescapeSql(match[1]));
  for (let index = 0; index + 1 < parts.length; index += 2) {
    result.set(parts[index], parts[index + 1]);
  }
  return result;
}

function parseSeedResources(sql) {
  const rows = [];
  for (const line of sql.split(/\r?\n/u)) {
    if (!/^\s*\(\d{15,}\s*,/u.test(line)) continue;
    const args = splitSqlRow(line);
    if (!args || args.length < 8) continue;
    const literal = (value) =>
      /^'(?:''|[^'])*'$/su.test(value) ? unescapeSql(value.slice(1, -1)) : undefined;
    const key = literal(args[1]);
    const defaultText = literal(args[2]);
    const status = literal(args[7]);
    if (key === undefined || defaultText === undefined || status === undefined) continue;
    rows.push({
      key,
      defaultText,
      translations: parseTranslations(args[3]),
      publicVisible: args[5] === '1',
      status,
    });
  }
  return rows;
}

function parseGeneratedButtonMenuResources(sql, sourceName, fail) {
  const keys = new Set();
  for (const line of sql.split(/\r?\n/u)) {
    const match = line.match(
      /(?:SELECT|UNION ALL SELECT)\s+\d+(?:\s+AS\s+sort_no)?\s*,\s*'(system:[a-z0-9-]+:[a-z0-9-]+)'/u,
    );
    if (!match) continue;
    const key = `menu.system.permission.${match[1].replaceAll(':', '.')}`;
    keys.add(key);
    if (!line.includes("'en-US'") || !line.includes("'ja-JP'")) {
      fail(`${sourceName} 的内置按钮资源缺少 en-US 或 ja-JP：${key}`);
    }
  }
  return keys;
}

export function loadI18nSqlCatalog({ serviceRoot, primary, secondary, fail }) {
  const migrationDirectory = path.join(serviceRoot, 'sql', 'increment');
  const migrationPaths = fs
    .readdirSync(migrationDirectory)
    .filter((name) => /^V\d+__.*\.sql$/u.test(name))
    .sort(
      (left, right) => Number(left.match(/^V(\d+)/u)?.[1]) - Number(right.match(/^V(\d+)/u)?.[1]),
    )
    .map((name) => path.join(migrationDirectory, name));
  const primaryCatalog = new Map();
  const secondaryCatalog = new Map();
  for (const migrationPath of migrationPaths) {
    for (const row of parseSeedResources(fs.readFileSync(migrationPath, 'utf8'))) {
      const translated = row.translations.get(secondary);
      if (!translated) {
        fail(`国际化资源缺少 ${secondary}：${row.key}`);
        continue;
      }
      if (primaryCatalog.has(row.key)) fail(`Flyway 国际化资源存在重复 key：${row.key}`);
      primaryCatalog.set(row.key, row.defaultText);
      secondaryCatalog.set(row.key, translated);
      for (const [locale, text] of row.translations) {
        if (placeholders(row.defaultText).join('\n') !== placeholders(text).join('\n')) {
          fail(`国际化资源的插值占位符与默认文案不一致：${row.key}（${locale}）`);
        }
      }
    }
  }
  const checkedKeys = primaryCatalog.size;
  if (checkedKeys === 0) fail('Flyway 迁移未解析到任何国际化资源');

  const snapshotPath = path.join(serviceRoot, 'sql', 'schema.sql');
  const snapshotSql = fs.readFileSync(snapshotPath, 'utf8');
  const snapshotRows = parseSeedResources(snapshotSql);
  const snapshotKeys = new Set(snapshotRows.map((row) => row.key));
  for (const key of primaryCatalog.keys()) {
    if (!snapshotKeys.has(key)) fail(`sql/schema.sql 快照缺少增量已种入的 key：${key}`);
  }
  for (const key of snapshotKeys) {
    if (!primaryCatalog.has(key)) fail(`sql/schema.sql 快照多出增量没有的 key：${key}`);
  }
  const activeCatalogRows = new Map(
    snapshotRows.filter((row) => row.status === 'ENABLED').map((row) => [row.key, row]),
  );
  const activePrimaryCatalog = new Map(
    [...activeCatalogRows].map(([key, row]) => [key, row.defaultText]),
  );
  const activeSecondaryCatalog = new Map(
    [...activeCatalogRows]
      .map(([key, row]) => [key, row.translations.get(secondary)])
      .filter(([, translation]) => Boolean(translation)),
  );
  if (activePrimaryCatalog.size === 0) fail('sql/schema.sql 未解析到任何 ENABLED 国际化资源');

  const generatedButtonMigrationKeys = new Set(
    migrationPaths.flatMap((migrationPath) => [
      ...parseGeneratedButtonMenuResources(
        fs.readFileSync(migrationPath, 'utf8'),
        migrationPath,
        fail,
      ),
    ]),
  );
  const generatedButtonSnapshotKeys = parseGeneratedButtonMenuResources(
    snapshotSql,
    'sql/schema.sql',
    fail,
  );
  for (const key of generatedButtonMigrationKeys) {
    if (!generatedButtonSnapshotKeys.has(key)) {
      fail(`sql/schema.sql 快照缺少内置按钮资源：${key}`);
    }
  }
  for (const key of generatedButtonSnapshotKeys) {
    if (!generatedButtonMigrationKeys.has(key)) {
      fail(`sql/schema.sql 快照多出增量没有的内置按钮资源：${key}`);
    }
  }
  return {
    migrationPaths,
    primaryCatalog,
    secondaryCatalog,
    snapshotKeys,
    activeCatalogRows,
    activePrimaryCatalog,
    activeSecondaryCatalog,
    generatedButtonMigrationKeys,
    generatedButtonSnapshotKeys,
    checkedKeys,
  };
}
