import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Attempts to resolve a symbol to its definition file.
 */
export async function resolveSymbolPath(
  importPath: string,
  symbol: string,
  workspaceRoot: string
): Promise<string | null> {
  console.log("Resolving symbol path for import:", importPath, "symbol:", symbol);
  // Handle scoped or non-scoped import like "pkg" or "@org/pkg"
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    const importParts = importPath.split("/");
    console.log("Import parts:", importParts);
    // const packageName = importPath.startsWith("@")
    //   ? `${importParts[0]}/${importParts[1]}`
    //   : importParts[0];

    const packageName = importParts[importParts.length - 1];
    console.log("Package name:", packageName);
    const siblingPath = path.join(workspaceRoot, "..", packageName);

    console.log("Sibling path:", siblingPath);
    const packageJsonPath = path.join(siblingPath, "package.json");
    console.log("Package JSON path:", packageJsonPath);
    if (!fs.existsSync(packageJsonPath)) {
      console.warn(`Package not found: ${packageName} at ${siblingPath}`);
      return null;
    }

    return findSymbolInPackage(siblingPath, symbol);
  } else {
    // Local relative path import
    const fullImportPath = path.resolve(workspaceRoot, importPath);
    return findSymbolInFileOrDir(fullImportPath, symbol);
  }
}

function findSymbolInPackage(pkgPath: string, symbol: string): string | null {
  const possibleDirs = ["src", "lib", "dist", "build", "."];
  for (const dir of possibleDirs) {
    const candidatePath = path.join(pkgPath, dir);
    if (!fs.existsSync(candidatePath)) continue;
    const result = findSymbolInDirectory(candidatePath, symbol);
    if (result) return result;
  }
  return null;
}

function findSymbolInDirectory(dir: string, symbol: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    console.log("Checking file:", fullPath);
    if (fs.statSync(fullPath).isDirectory()) {
      console.log("Entering directory:", fullPath);
      const result = findSymbolInDirectory(fullPath, symbol);
      console.log("Result from directory:", result);
      if (result) return result;
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js") || fullPath.endsWith(".tsx") || fullPath.endsWith(".jsx")) {
      if (containsSymbol(fullPath, symbol)) return fullPath;
    }
  }
  return null;
}

function findSymbolInFileOrDir(importPath: string, symbol: string): string | null {
  if (fs.existsSync(importPath)) {
    if (fs.statSync(importPath).isDirectory()) {
      return findSymbolInDirectory(importPath, symbol);
    } else {
      return containsSymbol(importPath, symbol) ? importPath : null;
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

    console.log(`Searching for symbol "${symbol}" in file: ${filePath}`);
    console.log("Source file text:", sourceFile.text);

    let found = false;

    const visit = (node: ts.Node) => {
      if (found) return;

      // Handle named exports like: export { X } or export { X as Y }
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          const exportedName = element.name.text;
          const originalName = element.propertyName?.text || exportedName;

          console.log(`[Named Export] Exported: ${exportedName}, Original: ${originalName}`);
          if (exportedName === symbol || originalName === symbol) {
            found = true;
            return;
          }
        }
      }

      // Handle export default SomeIdentifier
      else if (ts.isExportAssignment(node)) {
        if (!node.isExportEquals && ts.isIdentifier(node.expression)) {
          const name = node.expression.text;
          console.log(`[Default Export Assignment] Identifier: ${name}`);
          if (name === symbol) {
            found = true;
            return;
          }
        }
      }

      // Handle inline default exports: export default function X() {}
      else if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const name = node.name?.text;
        console.log(`[Exported Function/Class] Name: ${name}`);
        if (name === symbol) {
          found = true;
          return;
        }
      }

      // Handle export const X = ...
      else if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const varName = decl.name.text;
            console.log(`[Exported Variable] Name: ${varName}`);
            if (varName === symbol) {
              found = true;
              return;
            }
          }
        }
      }

      // Recurse into child nodes
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    return found;
  } catch (e) {
    console.error("Failed to parse file:", filePath, e);
    return false;
  }
}

