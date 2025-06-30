import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

const IGNORED_FOLDERS = [ "lib", "dist", "build", "node_modules", "test", "tests", "spec", "specs", "examples", "example", "demo", "demos" ];

function getIndexFile(pkgPath: string): string | null {
  const indexFiles = ["index.ts", "index.tsx", "index.js", "index.jsx"];
  for (const file of indexFiles) {
    const fullPath = path.join(pkgPath, file);
    const fullPathInSrc = path.join(pkgPath, 'src', file);

    if (fs.existsSync(fullPath)) {return fullPath;}
    if (fs.existsSync(fullPathInSrc)) {return fullPathInSrc;}

  }
  return null;
}

export async function resolveSymbolPath(
  importPath: string,
  symbol: string,
  workspaceRoot: string
): Promise<string | null> {
  console.log("Resolving symbol path for import:", importPath, "symbol:", symbol);
  // Handle scoped or non-scoped import like "pkg" or "@org/pkg"
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    const importParts = importPath.split("/");
    const packageName = importParts[importParts.length - 1];
    const siblingPath = path.join(workspaceRoot, "..", packageName);
    const packageJsonPath = path.join(siblingPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      console.warn(`Package not found: ${packageName} at ${siblingPath}`);
      return null;
    }

    return findSymbolInPackage(siblingPath, symbol);
  }
  return null;
}

function findSymbolInPackage(pkgPath: string, symbol: string): string | null {
  const possibleDirs = ["src", "."];
  for (const dir of possibleDirs) {
    const candidatePath = path.join(pkgPath, dir);
    if (!fs.existsSync(candidatePath)) {continue;}
    const result = findSymbolInDirectory(candidatePath, symbol);
    if (result) {return result;}
    const indexFile = getIndexFile(pkgPath);
    if (indexFile) {
      // Check if the index file contains the symbol
      return indexFile;
    }
  }
  return null;
}

function findSymbolInDirectory(dir: string, symbol: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if(IGNORED_FOLDERS.includes(file) ) {
      continue;
    }
    if (fs.statSync(fullPath).isDirectory()) {
      const result = findSymbolInDirectory(fullPath, symbol);
      if (result) {return result;}
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js") || fullPath.endsWith(".tsx") || fullPath.endsWith(".jsx")) {
      if (containsSymbol(fullPath, symbol)) {return fullPath;}
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

    const visit = (node: ts.Node) => {
      if (found) {return;}

      // Handle named exports like: export { X } or export { X as Y }
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          const exportedName = element.name.text;
          const originalName = element.propertyName?.text || exportedName;

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

