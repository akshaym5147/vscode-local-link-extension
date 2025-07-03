import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";

const outputChannel = vscode.window.createOutputChannel('Local Link Extension');

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
      outputChannel.appendLine(`[getIndexFile] Found index file at: ${fullPath}`);
      return fullPath;
    }
    if (fs.existsSync(fullPathInSrc)) {
      outputChannel.appendLine(`[getIndexFile] Found index file in src at: ${fullPathInSrc}`);
      return fullPathInSrc;
    }
  }
  outputChannel.appendLine(`[getIndexFile] No index file found in: ${pkgPath}`);
  return null;
}

export async function resolveSymbolPath(
  importPath: string,
  symbol: string,
  workspaceRoot: string
): Promise<string | null> {
  try {
    outputChannel.appendLine(`[resolveSymbolPath] importPath: ${importPath}, symbol: ${symbol}, workspaceRoot: ${workspaceRoot}`);
    // Handle scoped or non-scoped import like "pkg" or "@org/pkg"
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      const importParts = importPath.split("/");
      const packageName = importParts[importParts.length - 1];
      const siblingPath = path.join(workspaceRoot, "..", packageName);
      const packageJsonPath = path.join(siblingPath, "package.json");
      outputChannel.appendLine(`[resolveSymbolPath] Looking for sibling package at: ${siblingPath}`);
      if (!fs.existsSync(packageJsonPath)) {
        console.warn(`[resolveSymbolPath] Package not found: ${packageName} at ${siblingPath}`);
        return null;
      }
      const result = findSymbolInPackage(siblingPath, symbol);
      outputChannel.appendLine(`[resolveSymbolPath] findSymbolInPackage result: ${result}`);
      return result;
    }
    outputChannel.appendLine(`[resolveSymbolPath] importPath is relative or absolute, not handled.`);
    return null;
  } catch (e) {
    console.error('[resolveSymbolPath] Error:', e);
    return null;
  }
}

function findSymbolInPackage(pkgPath: string, symbol: string): string | null {
  outputChannel.appendLine(`[findSymbolInPackage] Searching for symbol '${symbol}' in package: ${pkgPath}`);
  const possibleDirs = ["src", "."];
  let indexFile: string | null = null;
  for (const dir of possibleDirs) {
    const candidatePath = path.join(pkgPath, dir);
    if (!fs.existsSync(candidatePath)) {
      outputChannel.appendLine(`[findSymbolInPackage] Directory does not exist: ${candidatePath}`);
      continue;
    }
    outputChannel.appendLine(`[findSymbolInPackage] Searching in directory: ${candidatePath}`);
    const result = findSymbolInDirectory(candidatePath, symbol);
    if (result) {
      outputChannel.appendLine(`[findSymbolInPackage] Found symbol '${symbol}' in: ${result}`);
      return result;
    }
    if (!indexFile) {
      indexFile = getIndexFile(pkgPath);
      if (indexFile) {
        outputChannel.appendLine(`[findSymbolInPackage] Fallback to index file: ${indexFile}`);
      }
    }
  }
  if (!indexFile) {
    outputChannel.appendLine(`[findSymbolInPackage] Symbol '${symbol}' not found in any directory or index file.`);
  }
  return indexFile;
}

function findSymbolInDirectory(dir: string, symbol: string): string | null {
  outputChannel.appendLine(`[findSymbolInDirectory] Searching for symbol '${symbol}' in directory: ${dir}`);
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (IGNORED_FOLDERS.includes(file)) {
      outputChannel.appendLine(`[findSymbolInDirectory] Skipping ignored folder: ${file}`);
      continue;
    }
    if (fs.statSync(fullPath).isDirectory()) {
      const result = findSymbolInDirectory(fullPath, symbol);
      if (result) {
        return result;
      }
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js") || fullPath.endsWith(".tsx") || fullPath.endsWith(".jsx")) {
      if (containsSymbol(fullPath, symbol)) {
        outputChannel.appendLine(`[findSymbolInDirectory] Found symbol '${symbol}' in file: ${fullPath}`);
        return fullPath;
      } else {
        outputChannel.appendLine(`[findSymbolInDirectory] Symbol '${symbol}' not found in file: ${fullPath}`);
      }
    }
  }
  outputChannel.appendLine(`[findSymbolInDirectory] Symbol '${symbol}' not found in directory: ${dir}`);
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
      if (found) {return;}
      if (isNamedExport(node, symbol)) { found = true; outputChannel.appendLine(`[containsSymbol] Found named export '${symbol}' in ${filePath}`); return; }
      if (isDefaultExportAssignment(node, symbol)) { found = true; outputChannel.appendLine(`[containsSymbol] Found default export assignment '${symbol}' in ${filePath}`); return; }
      if (isInlineDefaultExport(node, symbol)) { found = true; outputChannel.appendLine(`[containsSymbol] Found inline default export '${symbol}' in ${filePath}`); return; }
      if (isExportedVariable(node, symbol)) { found = true; outputChannel.appendLine(`[containsSymbol] Found exported variable '${symbol}' in ${filePath}`); return; }
      // NEW: Check for top-level variable, function, or class declaration (not exported)
      if (
        (ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.parent && ts.isSourceFile(node.parent)
      ) {
        // Variable
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === symbol) {
              found = true;
              outputChannel.appendLine(`[containsSymbol] Found top-level variable '${symbol}' in ${filePath}`);
              return;
            }
          }
        }
        // Function or class
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === symbol) {
          found = true;
          outputChannel.appendLine(`[containsSymbol] Found top-level function/class '${symbol}' in ${filePath}`);
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
        outputChannel.appendLine(`[containsSymbol] File name matches symbol: ${base} === ${symbol}`);
        found = true;
      } else {
        outputChannel.appendLine(`[containsSymbol] Symbol '${symbol}' not found in file: ${filePath}`);
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

