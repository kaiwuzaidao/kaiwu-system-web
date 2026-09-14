/**
 * 前端分层约束：只查**依赖方向**，不查行数、不查文件是否存在。
 *
 * 为什么重写——旧版 check-page-boundaries.mjs 已经在腐烂：
 *
 *   - `Projects/index.tsx > 700 行` —— 当前 472 行，余量 228，长期不会触发；
 *   - `LocalizedNameField/index.tsx > 300 行`、`check-i18n-consistency.mjs > 420 行`
 *     —— 后者更离谱：一道门禁在检查另一道门禁的行数；
 *   - 「某几个协作文件必须存在」—— 这不是架构约束，是「别把我拆好的文件删了」。
 *
 * 这些都是某次重构后钉住成果的**快照**：重构时会误伤，而真正的架构漂移（越层调用、
 * 反向依赖、绕过 services 直接发请求）它一个都看不见。
 *
 * 依赖方向则不会腐烂：层次关系是设计决定，不随代码量变化。当前全部规则零违规，
 * 因此它们守的是「不要退化」，而不是「先欠着」。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
/** Umi 生成目录不是人写的代码。 */
const GENERATED = /(^|[\\/])\.umi(-production)?([\\/]|$)/;

const problems = [];

function sourceFiles(relativeDir) {
  const directory = path.join(SRC, relativeDir);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true })
    .filter((name) => typeof name === 'string' && /\.tsx?$/.test(name))
    .map((name) => path.posix.join('src', relativeDir, name.split(path.sep).join('/')))
    .filter((relativePath) => !GENERATED.test(relativePath));
}

/** 取一个文件里所有 import 的模块说明符（含 `export ... from`）。 */
function importsOf(relativePath) {
  const source = ts.createSourceFile(
    relativePath,
    fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push({
        text: node.moduleSpecifier.text,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/**
 * 规则一：依赖方向。
 *
 * UI 由外向内依赖：pages -> components -> hooks/utils/services/dictionaries。
 * 反过来任何一步都意味着「通用层知道了某个具体页面」，那一层就再也搬不动了。
 */
const FORBIDDEN_IMPORTS = [
  { from: 'components', banned: ['@/pages'], why: '通用组件不得依赖具体页面' },
  { from: 'services', banned: ['@/pages', '@/components'], why: '数据层不得依赖 UI' },
  { from: 'hooks', banned: ['@/pages'], why: 'hooks 不得依赖具体页面' },
  { from: 'utils', banned: ['@/pages', '@/components'], why: '工具层不得依赖 UI' },
  { from: 'dictionaries', banned: ['@/pages', '@/components'], why: '字典定义不得依赖 UI' },
];

for (const { from, banned, why } of FORBIDDEN_IMPORTS) {
  for (const file of sourceFiles(from)) {
    for (const { text, line } of importsOf(file)) {
      if (banned.some((prefix) => text === prefix || text.startsWith(`${prefix}/`))) {
        problems.push(`${file}:${line} 依赖 ${text}——${why}`);
      }
    }
  }
}

/**
 * 规则二：页面之间不得互相 import。
 *
 * 页面是路由的叶子，互相引用会让「删掉一个页面」变成牵一发动全身。
 * 需要复用的东西应当提到 components/ 或 hooks/。
 */
for (const file of sourceFiles('pages')) {
  const owner = file.split('/')[2];
  for (const { text, line } of importsOf(file)) {
    const match = /^@\/pages\/([^/]+)/.exec(text);
    if (match && match[1] !== owner) {
      problems.push(`${file}:${line} 跨页依赖 ${text}——需要复用请提到 components/ 或 hooks/`);
    }
  }
}

/**
 * 规则三：请求统一经 services/。
 *
 * 页面或组件里直接 fetch/axios 会绕过统一的鉴权头、错误码解析与 Gateway 前缀，
 * 这类调用出问题时表现为「只有这一个功能不对」，很难联想到是绕过了封装。
 */
for (const file of [...sourceFiles('pages'), ...sourceFiles('components')]) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  source.split(/\r?\n/u).forEach((text, index) => {
    if (/\bfetch\s*\(|\baxios\b|XMLHttpRequest/.test(text)) {
      problems.push(`${file}:${index + 1} 直接发起请求——请求必须经 services/ 封装`);
    }
  });
}

/**
 * 规则四：不得硬编码后端地址。
 *
 * CLAUDE.md 常见坑：本地前端的 `/api` 必须走 8088 Gateway，不得为了方便直连 8080 System。
 * 直连会绕过 Gateway 的鉴权与 Context 签发，本地能跑、上环境就崩。
 */
for (const file of [
  ...sourceFiles('pages'),
  ...sourceFiles('components'),
  ...sourceFiles('services'),
]) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  source.split(/\r?\n/u).forEach((text, index) => {
    if (/https?:\/\/[^'"`\s]*:\d{2,5}/.test(text)) {
      problems.push(`${file}:${index + 1} 硬编码了后端地址——/api 必须走 Gateway 相对路径`);
    }
  });
}

/**
 * 规则五：页面 index.tsx 只导出页面本身。
 *
 * 这条取代旧版「Projects/index.tsx 不得内嵌 MembersPanel/RolesPanel/MenusPanel」——
 * 那是针对一次具体重构的快照；真正要守的是「页面编排层不兼做组件库」，
 * 一旦 index.tsx 开始对外导出别的东西，它就在变成杂物间。
 */
for (const file of sourceFiles('pages').filter((name) => name.endsWith('/index.tsx'))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(ROOT, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const exported = [];
  const visit = (node) => {
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
        exported.push(node.name ? node.name.text : 'default');
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((declaration) => {
          exported.push(declaration.name.getText(source));
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (exported.length > 1) {
    problems.push(
      `${file} 导出了 ${exported.length} 个符号（${exported.join(', ')}）` +
        '——页面编排层只应导出页面本身，其余请拆到同目录 components/',
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`[check:architecture] ${problem}`);
  process.exit(1);
}
console.log(
  '[check:architecture] 分层依赖方向正确：无反向依赖、无跨页引用、' +
    '请求统一经 services、无硬编码后端地址、页面只导出自身。',
);
