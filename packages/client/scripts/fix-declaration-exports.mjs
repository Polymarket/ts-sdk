import { readFile, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// tsup's declaration bundler loses type-only re-exports. Restore them from
// explicit JS export lists without importing or executing the built package.
export function fixDeclarationExports(javascript, declarations) {
  function parse(text, name, kind) {
    const source = ts.createSourceFile(
      name,
      text,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    if (source.parseDiagnostics.length) {
      throw new Error(`Cannot parse ${name}`);
    }
    return source;
  }

  function exports(source) {
    return source.statements.filter((statement) => {
      if (ts.isExportDeclaration(statement)) {
        if (
          statement.exportClause &&
          !ts.isNamedExports(statement.exportClause)
        ) {
          throw new Error('Unsupported namespace export');
        }
        return true;
      }
      if (
        ts.isExportAssignment(statement) ||
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )
      ) {
        throw new Error('Expected bundled export lists');
      }
      return false;
    });
  }

  const values = new Set();
  for (const statement of exports(
    parse(javascript, 'bundle.js', ts.ScriptKind.JS),
  )) {
    if (
      !statement.exportClause ||
      statement.isTypeOnly ||
      statement.exportClause.elements.some((element) => element.isTypeOnly)
    ) {
      // An external star may transitively expose values: never guess its names.
      throw new Error('Expected JavaScript named value exports');
    }
    for (const element of statement.exportClause.elements)
      values.add(element.name.text);
  }

  if (!values.size) throw new Error('Expected nonempty ESM export lists');

  const source = parse(declarations, 'bundle.d.ts', ts.ScriptKind.TS);
  const insertions = [];
  for (const statement of exports(source)) {
    if (statement.isTypeOnly) continue;
    if (!statement.exportClause) {
      insertions.push(statement.getStart(source) + 'export'.length);
    } else {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly && !values.has(element.name.text)) {
          insertions.push(element.getStart(source));
        }
      }
    }
  }
  return insertions
    .sort((a, b) => b - a)
    .reduce(
      (text, position) =>
        `${text.slice(0, position)} type ${text.slice(position)}`,
      declarations,
    );
}

export async function fixClientDeclarations() {
  // Fixed build-owned paths, deliberately independent of package.json input.
  const entries = [
    'index',
    'actions/index',
    'node',
    'ethers-v5',
    'privy',
    'viem',
  ];
  const dist = new URL('../dist/', import.meta.url);
  const updates = [];
  for (const entry of entries) {
    const paths = ['js', 'd.ts'].map(
      (extension) => new URL(`${entry}.${extension}`, dist),
    );
    for (const path of paths) {
      if ((await realpath(path)) !== fileURLToPath(path)) {
        throw new Error(`Refusing symlinked build artifact: ${path}`);
      }
    }
    const [javascript, declarations] = await Promise.all(
      paths.map((path) => readFile(path, 'utf8')),
    );
    updates.push([paths[1], fixDeclarationExports(javascript, declarations)]);
  }
  // Validate every entry before modifying any declaration.
  for (const [path, declarations] of updates)
    await writeFile(path, declarations);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await fixClientDeclarations();
