import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

function logToFile(message: string) {
  const logPath = path.join(__dirname, 'my-extension-log.txt');
  fs.appendFileSync(logPath, message + '\\n');
}

const IGNORED_FOLDERS = [
  "lib", "dist", "build", "node_modules", "test", "tests", "spec", "specs", "examples", "example", "demo", "demos"
];

function getIndexFile(pkgPath: string): string | null {
  const indexFiles = ["index.ts", "index.tsx", "index.js", "index.jsx"];
  for (const file of indexFiles) {
    const fullPath = path.join(pkgPath, file);
    const fullPathInSrc = path.join(pkgPath, "src", file);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    if (fs.existsSync(fullPathInSrc)) {
      return fullPathInSrc;
    }
  }
  return null;
}

export async function resolveSymbolPath(
  importPath: string,
  symbol: string,
  workspaceRoot: string
): Promise<string | null> {
  try {
    // Handle scoped or non-scoped import like "pkg" or "@org/pkg"
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      const importParts = importPath.split("/");
      const packageName = importParts[importParts.length - 1];
      const siblingPath = path.join(workspaceRoot, "..", packageName);
      const packageJsonPath = path.join(siblingPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
      const result = findSymbolInPackage(siblingPath, symbol);
      return result;
    }
    return null;
  } catch (e) {
    console.error('[resolveSymbolPath] Error:', e);
    return null;
  }
}

function findSymbolInPackage(pkgPath: string, symbol: string): string | null {
  const possibleDirs = ["src", "."];
  let indexFile: string | null = null;
  for (const dir of possibleDirs) {
    const candidatePath = path.join(pkgPath, dir);
    if (!fs.existsSync(candidatePath)) {
      continue;
    }
    const result = findSymbolInDirectory(candidatePath, symbol);
    if (result) {
      return result;
    }
    if (!indexFile) {
      indexFile = getIndexFile(pkgPath);
    }
  }
  return indexFile;
}

function findSymbolInDirectory(dir: string, symbol: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (IGNORED_FOLDERS.includes(file)) {
      continue;
    }
    if (fs.statSync(fullPath).isDirectory()) {
      const result = findSymbolInDirectory(fullPath, symbol);
      if (result) {
        return result;
      }
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js") || fullPath.endsWith(".tsx") || fullPath.endsWith(".jsx")) {
      if (containsSymbol(fullPath, symbol)) {
        return fullPath;
      }
    }
  }
  return null;
}

function containsSymbol(filePath: string, symbol: string): boolean {
  try {
    const sourceCode = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );
    let found = false;
    function visit(node: ts.Node) {
      if (found) { return; }

      if(
        isNamedExport(node, symbol)
        || isDefaultExportAssignment(node, symbol)
        || isInlineDefaultExport(node, symbol)
        || isExportedVariable(node, symbol)
      ) {
        found = true;
        return;
      }

      // NEW: Check for top-level variable, function, or class declaration (not exported)
      if (
        (
          ts.isVariableStatement(node)
          || ts.isFunctionDeclaration(node) 
          || ts.isClassDeclaration(node)
        ) &&
        node.parent && ts.isSourceFile(node.parent)
      ) {
        // Variable
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === symbol) {
              found = true;
              return;
            }
          }
        }
        // Function or class
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === symbol) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
    if (!found) {
      // Suggest: check if file name matches symbol
      const base = path.basename(filePath, path.extname(filePath));
      if (base === symbol) {
        found = true;
      }
    }
    return found;
  } catch (e) {
    console.error(`[containsSymbol] Failed to parse file: ${filePath}`, e);
    return false;
  }
}

function isNamedExport(node: ts.Node, symbol: string): boolean {
  if (
    ts.isExportDeclaration(node) &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause)
  ) {
    for (const element of node.exportClause.elements) {
      const exportedName = element.name.text;
      const originalName = element.propertyName?.text || exportedName;
      if (exportedName === symbol || originalName === symbol) {
        return true;
      }
    }
  }
  return false;
}

function isDefaultExportAssignment(node: ts.Node, symbol: string): boolean {
  if (ts.isExportAssignment(node)) {
    if (!node.isExportEquals && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === symbol) {
        return true;
      }
    }
  }
  return false;
}

function isInlineDefaultExport(node: ts.Node, symbol: string): boolean {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    const name = node.name?.text;
    if (name === symbol) {
      return true;
    }
  }
  return false;
}

function isExportedVariable(node: ts.Node, symbol: string): boolean {
  if (
    ts.isVariableStatement(node) &&
    node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const varName = decl.name.text;
        if (varName === symbol) {
          return true;
        }
      }
    }
  }
  return false;
}

