// import * as vscode from 'vscode';
// import * as path from 'path';
// import {
//   Node,
//   Project,
//   ts,
//   ExportedDeclarations,
//   FunctionDeclaration,
//   ClassDeclaration,
//   VariableDeclaration,
//   Identifier,
//   SourceFile
// } from "ts-morph";
// import * as fs from 'fs';



// import {
//   Location,
//   Position,
//   Uri,
// } from 'vscode';


// export function findDeclaration(sourceFile: SourceFile, selectedWord: string): Location | null {
//   // Try to find a named export directly
//   const exportSymbol = sourceFile.getExportSymbols().find(sym => sym.getName() === selectedWord);

//   if (exportSymbol) {
//     const declarations = exportSymbol.getDeclarations();
//     if (declarations.length > 0) {
//       const declaration = declarations[0];
//       const position = new Position(declaration.getStartLineNumber() - 1, declaration.getStartLinePos());
//       const location = new Location(Uri.file(declaration.getSourceFile().getFilePath()), position);
//       return location;
//     }
//   }

//   // Handle default export aliasing
//   const defaultExportDeclaration = sourceFile.getDefaultExportSymbol()?.getDeclarations()[0];
//   if (defaultExportDeclaration && Node.isExportAssignment(defaultExportDeclaration)) {
//     const expression = defaultExportDeclaration.getExpression();

//     // Check if the expression is an identifier (e.g., `export default QuestionItem`)
//     if (Node.isIdentifier(expression)) {
//       const aliasName = expression.getText(); // e.g., "QuestionItem"
//       const aliasSymbol = expression.getSymbol();

//       const actualDeclarations = aliasSymbol?.getDeclarations();
//       if (actualDeclarations && actualDeclarations.length > 0) {
//         const actualDeclaration = actualDeclarations[0];
//         const actualName = actualDeclaration.getSymbol()?.getName();

//         if (
//           actualName &&
//           (selectedWord === actualName ||
//             selectedWord.includes(actualName) || // e.g., QuestionItemComponent
//             selectedWord.startsWith(actualName))
//         ) {
//           const position = new Position(actualDeclaration.getStartLineNumber() - 1, actualDeclaration.getStartLinePos());
//           const location = new Location(Uri.file(actualDeclaration.getSourceFile().getFilePath()), position);
//           return location;
//         }
//       }
//     }
//   }

//   return null; // Nothing found
// }


// export function activate(context: vscode.ExtensionContext) {
//   const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';

//   context.subscriptions.push(
//     vscode.languages.registerDefinitionProvider(
//       ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'], {
//       async provideDefinition(document, position, token) {
//         console.log("🟡 provideDefinition triggered");
//         const wordRange = document.getWordRangeAtPosition(position);
//         if (!wordRange) { return; }

//         const word = document.getText(wordRange);
//         const text = document.getText();
//         console.log("🟡 provideDefinition triggered for:", word);

//         // 🔒 Escape special characters in the word for regex
//         const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//         const safeWord = escapeRegex(word);

//         // ✅ Regex to handle default, named, and mixed imports
//         // Step 1: Use multiple regex patterns
//         const importRegexes = [
//           // default or mixed import: import Highlighter from "module";
//           new RegExp(`import\\s+${safeWord}\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s+['"]([^'"]+)['"]`),
//           // named import: import { Highlighter } from "module";
//           new RegExp(`import\\s+\\{[^}]*\\b${safeWord}\\b[^}]*\\}\\s*from\\s+['"]([^'"]+)['"]`),
//         ];

//         // Step 2: Try to match any regex
//         let moduleName: string | undefined;
//         for (const regex of importRegexes) {
//           const match = regex.exec(text);
//           if (match) {
//             moduleName = match[1];
//             console.log(`📦 Matched import: '${word}' from '${moduleName}'`);
//             break;
//           }
//         }

//         if (!moduleName) {
//           console.log(`❌ No matching import found for '${word}'`);
//           return;
//         }

//         console.log(`📦 Trying to resolve symbol '${word}' from module: '${moduleName}'`);

//         const parentDir = path.resolve(workspaceFolder, '..');
//         let localPath: string | undefined;

//         const siblingDirs = fs.readdirSync(parentDir, { withFileTypes: true })
//           .filter(entry => entry.isDirectory())
//           .map(entry => entry.name);

//         for (const dir of siblingDirs) {
//           console.log(`🔍 Checking directory: ${dir} \n\n\n`);
//           const pkgJsonPath = path.join(parentDir, dir, 'package.json');
//           if (fs.existsSync(pkgJsonPath)) {
//             try {
//               const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
//               const moduleShortName = moduleName.split('/').pop();
//               console.log(`🔍 Checking package.json in ${dir}:`, pkg.name);
//               console.log(`🔍 Checking against moduleName: ${moduleName} and moduleShortName: ${moduleShortName}`);
//               if (pkg.name === moduleName || pkg.name === moduleShortName) {
//                 localPath = path.join(parentDir, dir);
//                 console.log(`✅ Found local package '${pkg.name}' at: ${localPath}`);
//                 break;
//               }
//             } catch (err) {
//               console.log(`⚠️ Failed to parse package.json in ${dir}:`, err);
//             }
//           }
//         }

//         if (!localPath) {
//           console.log(`❌ No local package found for '${moduleName}'`);
//           return null;
//         }

//         // ✅ Initialize ts-morph project
//         const project = new Project({
//           useInMemoryFileSystem: false,
//           skipFileDependencyResolution: true,
//           compilerOptions: {
//             allowJs: true,
//             checkJs: false,
//             jsx: ts.JsxEmit.React,
//             target: ts.ScriptTarget.ESNext,
//             module: ts.ModuleKind.ESNext
//           },
//           skipAddingFilesFromTsConfig: true,
//         });


//         // const sourceFiles = project.getSourceFiles();

//         let sourceFiles;
//         const tsconfigPath = path.join(localPath, 'tsconfig.json');

//         if (fs.existsSync(tsconfigPath)) {
//           project.addSourceFilesFromTsConfig(tsconfigPath);
//           console.log("✅ Loaded source files from tsconfig.");
//         } else {
//           project.addSourceFilesAtPaths([
//             path.join(localPath, '**/*.js'),
//             path.join(localPath, '**/*.ts'),
//             path.join(localPath, '**/*.jsx'),
//             path.join(localPath, '**/*.tsx'),
//             `!${path.join(localPath, '**/*.test.*')}`,
//             `!${path.join(localPath, '**/__tests__/**')}`,
//             `!${path.join(localPath, '**/node_modules/**')}`,
//             `!${path.join(localPath, '**/dist/**')}`,
//             `!${path.join(localPath, '**/build/**')}`,
//             `!${path.join(localPath, '**/.next/**')}`,
//           ]);

//           console.log("📂 Manually added JS/TS source files.");
//         }

//         sourceFiles = project.getSourceFiles().filter(file =>
//           !file.getFilePath().includes('node_modules')
//         );;
//         console.log("📁 Final source files loaded:", sourceFiles.map(f => f.getFilePath()));


//         console.log(`📄 Scanning ${sourceFiles.length} source files in ${moduleName}`);

//         const foundLocations: vscode.Location[] = [];

//         sourceFiles.sort((a, b) => {
//           const aName = path.basename(a.getFilePath()).toLowerCase();
//           const bName = path.basename(b.getFilePath()).toLowerCase();
//           return (aName === 'index.js' || aName === 'index.ts') ? -1 : 1;
//         });


//         for (const sourceFile of sourceFiles) {
//           try {
//             const filePath = sourceFile.getFilePath();



//             // ⛔ Skip test files, node_modules, dist, etc.
//             if (
//               /(__tests__|\.test\.(js|ts|jsx|tsx)|node_modules|\.next|dist|build)/.test(filePath)
//             ) {
//               console.log(`🚫 Skipping test/build file: ${filePath}`);
//               continue;
//             }

//             console.log(`🔍 Checking file: ${filePath}`);
//             const exportedDeclarations = sourceFile.getExportedDeclarations();
//             console.log(sourceFile);
//             console.log(`exportedDeclarations}`, exportedDeclarations);

//             for (const [name, declarations] of exportedDeclarations) {
//               console.log(`🔗 Checking export: ${name} with declarations: ${declarations.length}`);
//               // ✅ Match named export
//               if (name === word && declarations.length) {
//                 const decl = declarations[0];
//                 const file = decl.getSourceFile();
//                 const line = decl.getStartLineNumber?.() ?? 1;
//                 return new vscode.Location(vscode.Uri.file(file.getFilePath()), new vscode.Position(line - 1, 0));
//               }

//               // ✅ Handle default export: match identifier within expression
//               if (name === 'default') {
//                 // for (const decl of declarations) {
//                 //   let finalDecl = decl;

//                 //   // Resolve alias, if any
//                 //   const symbol = decl.getSymbol();
//                 //   const aliased = symbol?.getAliasedSymbol();
//                 //   const aliasedDecls = aliased?.getDeclarations();
//                 //   if (aliasedDecls?.length) {
//                 //     finalDecl = aliasedDecls[0] as typeof finalDecl;
//                 //   }

//                 //   const declSymbol = finalDecl.getSymbol();
//                 //   const declName = declSymbol?.getName?.();

//                 //   // If export is wrapped (e.g., `export default someFunc()`)
//                 //   const expr = (finalDecl as any).getExpression?.();
//                 //   const exprName = expr?.getText?.();

//                 //   const file = finalDecl.getSourceFile();
//                 //   const line = finalDecl.getStartLineNumber?.() ?? 1;

//                 //   console.log(`🔗 Found expression name: ${exprName} in ${file.getFilePath()}`);


//                 //   if (exprName) {
//                 //     // Look for matching import declarations
//                 //     const imports = sourceFile.getImportDeclarations();
//                 //     console.log(`🔗 Checking ${imports.length} imports in ${file.getFilePath()}`);
//                 //     console.log(`🔗 Looking for import of expression '${exprName}'`)
//                 //     console.log(`🔗 Looking for import '${imports}'`);
//                 //     const match = imports.find(imp => {
//                 //       return imp.getDefaultImport()?.getText() === exprName;
//                 //     });

//                 //     console.log(`🔗 Checking imports for expression '${exprName}' in ${file.getFilePath()}`);

//                 //     if (match) {
//                 //       const resolvedSourceFile = match.getModuleSpecifierSourceFile();
//                 //       if (resolvedSourceFile) {
//                 //         console.log(`🔗 Following import of '${exprName}' to ${resolvedSourceFile.getFilePath()}`);

//                 //         const resolvedDecls = resolvedSourceFile.getExportedDeclarations().get('default');
//                 //         if (resolvedDecls?.length) {
//                 //           const resolved = resolvedDecls[0];
//                 //           const file = resolved.getSourceFile();
//                 //           const line = resolved.getStartLineNumber?.() ?? 1;

//                 //           return new vscode.Location(
//                 //             vscode.Uri.file(file.getFilePath()),
//                 //             new vscode.Position(line - 1, 0)
//                 //           );
//                 //         }
//                 //       }
//                 //     }
//                 //   }

//                 //   // 🧠 Matching logic
//                 //   const isMatching =
//                 //     word === name || // direct match
//                 //     word === declName || // matches original symbol name
//                 //     word === exprName || // matches expression's name
//                 //     (name === 'default' && word === declName); // matches default export name

//                 //   if (isMatching) {
//                 //     console.log(`🎯 Matched '${word}' to declaration in ${file.getFilePath()}:${line}`);
//                 //     return new vscode.Location(
//                 //       vscode.Uri.file(file.getFilePath()),
//                 //       new vscode.Position(line - 1, 0)
//                 //     );
//                 //   }

//                 //   if (!declName && name === 'default') {
//                 //     console.log(`ℹ️ Anonymous default export found in: ${file.getFilePath()}`);
//                 //   }
//                 // }


//                 for (const decl of declarations) {
//                   let finalDecl = decl;
//                   console.log(`\n 🔍 Checking declaration: ${decl.getText()} in ${sourceFile.getFilePath()}`);
//                   const symbol = decl.getSymbol();
//                   console.log(`🔗 Found symbol: ${symbol?.getName()} in ${sourceFile.getFilePath()}`);
//                   console.log(`🔗 Symbol kind: ${symbol?.getFlags()}`, symbol);
//                   const aliased = symbol?.getAliasedSymbol();
//                   console.log(`🔗 Found aliased symbol: ${aliased?.getName()} in ${sourceFile.getFilePath()}`);
//                   if (aliased) {
//                     const aliasedDecls = aliased.getDeclarations();
//                     if (aliasedDecls?.length) {
//                       finalDecl = aliasedDecls[0] as typeof finalDecl;
//                     }
//                   }

//                   console.log(`🔗 Final declaration: ${finalDecl.getText()} in ${sourceFile.getFilePath()}`);

//                   // 🧭 Attempt to resolve through import (e.g., export default ImportedSymbol)
//                   const expr = (finalDecl as any).getExpression?.();
//                   const exprName = expr?.getText?.();
//                   console.log(`🔗 Found expression name: ${exprName} in ${sourceFile.getFilePath()}`);
//                   if (exprName) {
//                     const imports = sourceFile.getImportDeclarations();
//                     const match = imports.find(imp => imp.getDefaultImport()?.getText() === exprName);
//                     if (match) {
//                       const resolvedSourceFile = match.getModuleSpecifierSourceFile();
//                       if (resolvedSourceFile) {
//                         console.log(`🔗 Following import of '${exprName}' to ${resolvedSourceFile.getFilePath()}`);
//                         const resolvedDecls = resolvedSourceFile.getExportedDeclarations().get('default');
//                         if (resolvedDecls?.length) {
//                           const resolved = resolvedDecls[0];
//                           const file = resolved.getSourceFile();
//                           const line = resolved.getStartLineNumber?.() ?? 1;
//                           return new vscode.Location(
//                             vscode.Uri.file(file.getFilePath()),
//                             new vscode.Position(line - 1, 0)
//                           );
//                         }
//                       }
//                     }
//                   }

//                   // ✅ Now safe to do matching
//                   const declName = finalDecl.getSymbol()?.getName?.();
//                   const exprKind = expr?.getKindName?.() ?? '';
//                   const isMatching =
//                     word === 'default' ||
//                     declName === word ||
//                     exprName === word ||
//                     /Identifier/.test(exprKind);

//                   if (isMatching) {
//                     const file = finalDecl.getSourceFile();
//                     const line = finalDecl.getStartLineNumber?.() ?? 1;
//                     return new vscode.Location(
//                       vscode.Uri.file(file.getFilePath()),
//                       new vscode.Position(line - 1, 0)
//                     );
//                   }

//                   // optional logging for anonymous default
//                   if (!declName && name === 'default') {
//                     console.log(`ℹ️ Anonymous default export in: ${sourceFile.getFilePath()}`);
//                   }
//                 }


//               }
//             }

//             console.log(`❌ Symbol '${word}' not found in ${filePath}`);
//           } catch (err) {
//             console.error(`🔥 Error in file ${sourceFile.getFilePath()}:`, err);
//           }
//         }


//         if (foundLocations.length > 0) {
//           console.log(`✅ Returning first match for '${word}'`);
//           return foundLocations[0];
//         } else {
//           console.log(`❌ No matches found for '${word}' in any source file.`);
//           return null;
//         }


//         console.log(`❌ Symbol '${word}' not found in exported declarations`);
//         return null;
//       }
//     })
//   );

//   console.log('🚀 Extension "local-definition-linker" is now active!');
// }


// export function deactivate() { }

// src/extension.ts
import * as vscode from "vscode";
import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { resolveSymbolPath } from "./resolver";

export function activate(context: vscode.ExtensionContext) {
  const provider = new LocalDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: "javascript" }, { language: "typescript" }],
      provider
    )
  );
}

class LocalDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | null> {
    console.log("provideDefinition triggered for", document.fileName);

    const wordRange = document.getWordRangeAtPosition(position);
    const symbol = document.getText(wordRange);

    const line = document.lineAt(position.line).text;
    const importPathMatch = line.match(
      /import\s+(?:\{[^}]*\}\s+from\s+|[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/
    );

    if (!importPathMatch) return null;

    const importPath = importPathMatch[1];
    const currentFilePath = document.uri.fsPath;
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    console.log("Import path:", importPath);
    console.log("Current file path:", currentFilePath);
    console.log("Workspace root:", workspaceRoot);

    if (!workspaceRoot) return null;

    const resolvedPath = await resolveSymbolPath(importPath, symbol, workspaceRoot);
    console.log('Resolved path:', resolvedPath);

    if (!resolvedPath) return null;

    return new vscode.Location(vscode.Uri.file(resolvedPath), new vscode.Position(0, 0));
  }
}

