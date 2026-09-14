import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const VISIBLE_ATTRIBUTES = new Set([
  'aria-label',
  'cancelText',
  'content',
  'description',
  'emptyText',
  'extra',
  'label',
  'message',
  'okText',
  'placeholder',
  'subTitle',
  'submitText',
  'title',
  'tooltip',
]);

export function collectUiFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  return fs
    .readdirSync(directory, { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.tsx'))
    .map((name) => path.join(relativeDirectory, name))
    .sort();
}

function containsVisibleText(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return undefined;
}

function reportLiteral(root, filepath, source, node, value, fail) {
  if (!containsVisibleText(value)) return;
  const start = node.getStart(source);
  const startLine = lineOf(source, node);
  const previousLine = source.text.split(/\r?\n/u)[startLine - 2] ?? '';
  const lineStart = source.text.lastIndexOf('\n', start - 1) + 1;
  const currentLinePrefix = source.text.slice(lineStart, start);
  if (
    previousLine.includes('i18n-ignore-next-line') ||
    currentLinePrefix.includes('i18n-ignore-next-line')
  )
    return;
  fail(`${path.relative(root, filepath)}:${startLine} 存在已迁移范围内的用户可见硬编码：${value}`);
}

function reportRenderedExpression(root, filepath, source, node, fail) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    reportLiteral(root, filepath, source, node, node.text, fail);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    reportLiteral(
      root,
      filepath,
      source,
      node,
      [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(''),
      fail,
    );
    return;
  }
  if (ts.isConditionalExpression(node)) {
    reportRenderedExpression(root, filepath, source, node.whenTrue, fail);
    reportRenderedExpression(root, filepath, source, node.whenFalse, fail);
    return;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    reportRenderedExpression(root, filepath, source, node.left, fail);
    reportRenderedExpression(root, filepath, source, node.right, fail);
    return;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    reportRenderedExpression(root, filepath, source, node.expression, fail);
  }
}

export function checkVisibleHardcoding(root, relativePath, fail) {
  const filepath = path.join(root, relativePath);
  const source = ts.createSourceFile(
    filepath,
    fs.readFileSync(filepath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (
        ts.isJsxElement(node.parent) &&
        ts.isIdentifier(node.parent.openingElement.tagName) &&
        node.parent.openingElement.tagName.text === 'style'
      )
        return;
      reportLiteral(root, filepath, source, node, node.text.trim(), fail);
      return;
    }
    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.text)) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) {
        reportLiteral(root, filepath, source, initializer, initializer.text, fail);
      } else if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
        reportRenderedExpression(root, filepath, source, initializer.expression, fail);
      }
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      if (
        ts.isJsxElement(node.parent) &&
        ts.isIdentifier(node.parent.openingElement.tagName) &&
        node.parent.openingElement.tagName.text === 'style'
      )
        return;
      reportRenderedExpression(root, filepath, source, node.expression, fail);
      return;
    }
    if (ts.isPropertyAssignment(node) && VISIBLE_ATTRIBUTES.has(propertyName(node.name))) {
      reportRenderedExpression(root, filepath, source, node.initializer, fail);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['error', 'info', 'success', 'warning'].includes(node.expression.name.text)
    ) {
      for (const argument of node.arguments) {
        reportRenderedExpression(root, filepath, source, argument, fail);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

export function checkStaticMessageKeys(
  root,
  relativePath,
  primary,
  secondary,
  primaryCatalog,
  secondaryCatalog,
  fail,
) {
  const filepath = path.join(root, relativePath);
  const source = ts.createSourceFile(
    filepath,
    fs.readFileSync(filepath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const checkKey = (node, key) => {
    const line = lineOf(source, node);
    if (!primaryCatalog.has(key))
      fail(`${relativePath}:${line} ${primary} 缺少 ENABLED 静态引用 key：${key}`);
    if (!secondaryCatalog.has(key))
      fail(`${relativePath}:${line} ${secondary} 缺少 ENABLED 静态引用 key：${key}`);
  };
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'formatMessage' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const id = node.arguments[0].properties.find(
        (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === 'id',
      );
      if (id && ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer)) {
        checkKey(id, id.initializer.text);
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.name.text === 'id' &&
      ts.isStringLiteral(node.initializer)
    ) {
      checkKey(node, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

export function collectStringPropertyKeys(filepath) {
  const source = ts.createSourceFile(
    filepath,
    fs.readFileSync(filepath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const keys = new Set();
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}
