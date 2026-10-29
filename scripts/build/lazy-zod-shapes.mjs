// esbuild plugin that defers Zod schema construction until a schema is first used.
//
// Two rewrites apply to emitted JavaScript only; declarations are generated from the
// untouched source, so public types do not change.
//
// 1. Shape fields: `key: expr` entries of object literals passed to `z.object`,
//    `z.strictObject`, `z.looseObject`, and `<Name>Schema.extend`/`.safeExtend` become
//    `get key() { return expr; }`. Zod resolves shape getters once on first read and reuses
//    the same schemas afterwards.
// 2. Module-private schemas: a top-level `const NameSchema = expr;` that is never exported
//    becomes a memoized accessor, and its value references call that accessor.
//
// Parsing behavior is unchanged while module evaluation allocates far fewer schema instances.

import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const OBJECT_CONSTRUCTORS = new Set(['object', 'strictObject', 'looseObject']);
const EXTEND_METHODS = new Set(['extend', 'safeExtend']);
const LAZY_SUFFIX = '$lazy';

function isShapeCall(node) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression)
  )
    return false;
  const [shape] = node.arguments;
  if (!shape || !ts.isObjectLiteralExpression(shape)) return false;
  const { expression: receiver, name } = node.expression;
  if (OBJECT_CONSTRUCTORS.has(name.text))
    return ts.isIdentifier(receiver) && receiver.text === 'z';
  if (EXTEND_METHODS.has(name.text))
    return ts.isIdentifier(receiver) && receiver.text.endsWith('Schema');
  return false;
}

function hasExportModifier(node) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      )
    : false;
}

// Identifiers and literals already reference existing values; deferring them saves nothing.
function isPlainValue(expression) {
  return (
    ts.isIdentifier(expression) ||
    ts.isPropertyAccessExpression(expression) ||
    ts.isLiteralExpression(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword
  );
}

function findLazySchemas(file) {
  const candidates = new Map();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || hasExportModifier(statement))
      continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    const [declaration, ...rest] = statement.declarationList.declarations;
    if (rest.length > 0 || !declaration.initializer) continue;
    if (
      !ts.isIdentifier(declaration.name) ||
      !declaration.name.text.endsWith('Schema')
    )
      continue;
    if (isPlainValue(declaration.initializer)) continue;
    candidates.set(declaration.name.text, { statement, declaration });
  }
  // Exported names and names declared more than once (shadowing) stay eager.
  const declarationCount = new Map();
  function visit(node) {
    if (ts.isExportSpecifier(node)) {
      candidates.delete((node.propertyName ?? node.name).text);
    } else if (
      ts.isExportAssignment(node) &&
      ts.isIdentifier(node.expression)
    ) {
      candidates.delete(node.expression.text);
    } else if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      declarationCount.set(
        node.name.text,
        (declarationCount.get(node.name.text) ?? 0) + 1,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const [name, count] of declarationCount)
    if (count > 1) candidates.delete(name);
  return candidates;
}

// Whether an identifier node reads the value of a top-level binding.
function isValueReference(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node)
    return false;
  if (ts.isQualifiedName(parent)) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  )
    return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent))
    return false;
  for (let current = node; current; current = current.parent) {
    if (ts.isTypeNode(current) && !ts.isExpressionWithTypeArguments(current))
      return false;
    if (
      ts.isTypeAliasDeclaration(current) ||
      ts.isInterfaceDeclaration(current)
    )
      return false;
  }
  return true;
}

export function transformLazyZodShapes(source, fileName) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const lazy = findLazySchemas(file);
  const edits = [];
  const replace = (start, end, text) => edits.push({ start, end, text });

  for (const [name, { statement, declaration }] of lazy) {
    const init = declaration.initializer;
    // `const NameSchema = expr;` -> `let NameSchema$value; function NameSchema$lazy() { return NameSchema$value ??= (expr); }`
    replace(
      statement.getStart(file),
      init.getStart(file),
      `let ${name}$value; function ${name}${LAZY_SUFFIX}() { return ${name}$value ??= (`,
    );
    replace(init.end, statement.end, '); }');
  }

  function defers(expression) {
    if (ts.isIdentifier(expression)) return lazy.has(expression.text);
    return !isPlainValue(expression);
  }

  function visit(node) {
    if (isShapeCall(node)) {
      for (const property of node.arguments[0].properties) {
        if (
          ts.isShorthandPropertyAssignment(property) &&
          lazy.has(property.name.text)
        ) {
          const name = property.name.text;
          replace(
            property.getStart(file),
            property.end,
            `get ${name}() { return ${name}${LAZY_SUFFIX}(); }`,
          );
          continue;
        }
        if (!ts.isPropertyAssignment(property) || !defers(property.initializer))
          continue;
        const nameText = property.name.getText(file);
        if (nameText === '__proto__' || nameText === "'__proto__'") continue;
        const start = property.name.getStart(file);
        replace(start, start, 'get ');
        replace(
          property.name.end,
          property.initializer.getStart(file),
          '() { return ',
        );
        replace(property.initializer.end, property.initializer.end, '; }');
      }
    } else if (
      ts.isIdentifier(node) &&
      lazy.has(node.text) &&
      !ts.isShorthandPropertyAssignment(node.parent) &&
      isValueReference(node)
    ) {
      replace(node.end, node.end, `${LAZY_SUFFIX}()`);
    } else if (
      ts.isShorthandPropertyAssignment(node) &&
      lazy.has(node.name.text) &&
      !isShapeCall(node.parent.parent)
    ) {
      replace(node.end, node.end, `: ${node.name.text}${LAZY_SUFFIX}()`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (edits.length === 0) return source;
  // Apply from the end so earlier offsets stay valid. Text inserted later at the same offset
  // lands in front, so inner (later-discovered) insertions precede outer ones.
  const ordered = edits
    .map((edit, index) => ({ ...edit, index }))
    .sort((a, b) => b.start - a.start || b.end - a.end || a.index - b.index);
  let output = source;
  for (const edit of ordered)
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

export function lazyZodShapes() {
  return {
    name: 'lazy-zod-shapes',
    setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, async (args) => {
        if (args.path.includes('node_modules')) return undefined;
        const source = await readFile(args.path, 'utf8');
        if (!source.includes("from 'zod'")) return undefined;
        return {
          contents: transformLazyZodShapes(source, args.path),
          loader: 'ts',
        };
      });
    },
  };
}
