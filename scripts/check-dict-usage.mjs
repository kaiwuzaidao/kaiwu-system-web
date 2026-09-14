/**
 * 校验「状态/枚举必须走统一字典组件」（CLAUDE.md）。
 *
 * 只卡两件**明确写进约定**的事，不做宽泛的启发式：
 *
 *   1. 页面里不得出现 `valueEnum` —— CLAUDE.md 字面禁令。
 *   2. 不得用 `<Tag>` 手工把状态映射成颜色 —— 这是绕过 `DictTag` 的实际写法。
 *
 * 为什么不卡「所有 status 字段都必须用 DictTag」：实测那样会命中 10 处，其中 9 处是
 * 「按状态选按钮文案」「按状态选进度条样式」这类正当 UI 逻辑，只有 1 处是真违规。
 * 一个九成误报的规则只会让人学会忽略红灯，比没有规则更糟。
 *
 * 判定依据是 TypeScript AST，不是正则：JSX 属性值里嵌三元、字符串里出现 `<Tag`
 * 这类情况，正则分不清。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/pages', 'src/components'];
/** DictSelect 自身要转发 antd 的 valueEnum 属性，属于组件实现而非页面用法。 */
const VALUE_ENUM_ALLOWED = new Set(['src/components/DictSelect/index.tsx']);

const problems = [];

function tsxFiles(relativeDir) {
  const directory = path.join(ROOT, relativeDir);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.tsx'))
    .map((name) => path.join(relativeDir, name));
}

/** JSX 属性值里是否出现了 `xxx === '常量'` 形式的比较。 */
function containsEnumComparison(node) {
  let found = false;
  const visit = (current) => {
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      (ts.isStringLiteral(current.right) || ts.isStringLiteral(current.left))
    ) {
      found = true;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

for (const relativePath of SCAN_DIRS.flatMap(tsxFiles)) {
  const filePath = path.join(ROOT, relativePath);
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node) => {
    // 规则 1：页面里的 valueEnum
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === 'valueEnum' &&
      !VALUE_ENUM_ALLOWED.has(relativePath)
    ) {
      problems.push(
        `${relativePath}:${lineOf(source, node)} 使用了 valueEnum；` +
          '枚举展示必须走 DictTag / DictSelect（CLAUDE.md）',
      );
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'valueEnum' &&
      !VALUE_ENUM_ALLOWED.has(relativePath)
    ) {
      problems.push(
        `${relativePath}:${lineOf(source, node)} 列定义里写了 valueEnum；` +
          '枚举展示必须走 DictTag / DictSelect（CLAUDE.md）',
      );
    }

    // 规则 2：<Tag color={xxx === 'CONST' ? ... : ...}> 手工映射状态颜色
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;
    if (opening && opening.tagName.getText(source) === 'Tag') {
      for (const attribute of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        if (attribute.name.getText(source) !== 'color') continue;
        const initializer = attribute.initializer;
        if (
          initializer &&
          ts.isJsxExpression(initializer) &&
          initializer.expression &&
          containsEnumComparison(initializer.expression)
        ) {
          problems.push(
            `${relativePath}:${lineOf(source, opening)} 用 <Tag> 手工把状态映射成颜色；` +
              '状态展示必须走 <DictTag>，颜色由字典项维护（CLAUDE.md）',
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`[check:dict-usage] ${problem}`);
  process.exit(1);
}
console.log('[check:dict-usage] 页面无 valueEnum，无手工状态颜色映射。');
