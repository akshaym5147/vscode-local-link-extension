import * as vscode from 'vscode';
import * as path from 'path';
import {
  Node,
  Project,
  ts,
  ExportedDeclarations,
  FunctionDeclaration,
  ClassDeclaration,
  VariableDeclaration,
  Identifier
} from "ts-morph";
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'], {
      async provideDefinition(document, position, token) {
        console.log("🟡 provideDefinition triggered");
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) { return; }

        const word = document.getText(wordRange);
        const text = document.getText();
        console.log("🟡 provideDefinition triggered for:", word);

        // 🔒 Escape special characters in the word for regex
        const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeWord = escapeRegex(word);

        // ✅ Regex to handle default, named, and mixed imports
        // Step 1: Use multiple regex patterns
        const importRegexes = [
          // default or mixed import: import Highlighter from "module";
          new RegExp(`import\\s+${safeWord}\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s+['"]([^'"]+)['"]`),
          // named import: import { Highlighter } from "module";
          new RegExp(`import\\s+\\{[^}]*\\b${safeWord}\\b[^}]*\\}\\s*from\\s+['"]([^'"]+)['"]`),
        ];

        // Step 2: Try to match any regex
        let moduleName: string | undefined;
        for (const regex of importRegexes) {
          const match = regex.exec(text);
          if (match) {
            moduleName = match[1];
            console.log(`📦 Matched import: '${word}' from '${moduleName}'`);
            break;
          }
        }

        if (!moduleName) {
          console.log(`❌ No matching import found for '${word}'`);
          return;
        }

        console.log(`📦 Trying to resolve symbol '${word}' from module: '${moduleName}'`);

        const parentDir = path.resolve(workspaceFolder, '..');
        let localPath: string | undefined;

        const siblingDirs = fs.readdirSync(parentDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);

        for (const dir of siblingDirs) {
          const pkgJsonPath = path.join(parentDir, dir, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
              const moduleShortName = moduleName.split('/').pop();
              if (pkg.name === moduleName || pkg.name === moduleShortName) {
                localPath = path.join(parentDir, dir);
                console.log(`✅ Found local package '${pkg.name}' at: ${localPath}`);
                break;
              }
            } catch (err) {
              console.log(`⚠️ Failed to parse package.json in ${dir}:`, err);
            }
          }
        }

        if (!localPath) {
          console.log(`❌ No local package found for '${moduleName}'`);
          return null;
        }

        // ✅ Initialize ts-morph project
        const project = new Project({
          useInMemoryFileSystem: false,
          skipFileDependencyResolution: true,
          compilerOptions: {
            allowJs: true,
            checkJs: false,
            jsx: ts.JsxEmit.React,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext
          },
          skipAddingFilesFromTsConfig: true,
        });


        // const sourceFiles = project.getSourceFiles();

        let sourceFiles;
        const tsconfigPath = path.join(localPath, 'tsconfig.json');

        if (fs.existsSync(tsconfigPath)) {
          project.addSourceFilesFromTsConfig(tsconfigPath);
          console.log("✅ Loaded source files from tsconfig.");
        } else {
          project.addSourceFilesAtPaths([
            path.join(localPath, '**/*.js'),
            path.join(localPath, '**/*.ts'),
            path.join(localPath, '**/*.jsx'),
            path.join(localPath, '**/*.tsx'),
            `!${path.join(localPath, '**/*.test.*')}`,
            `!${path.join(localPath, '**/__tests__/**')}`,
            `!${path.join(localPath, '**/node_modules/**')}`,
            `!${path.join(localPath, '**/dist/**')}`,
            `!${path.join(localPath, '**/build/**')}`,
            `!${path.join(localPath, '**/.next/**')}`,
          ]);

          console.log("📂 Manually added JS/TS source files.");
        }

        sourceFiles = project.getSourceFiles().filter(file =>
          !file.getFilePath().includes('node_modules')
        );;
        console.log("📁 Final source files loaded:", sourceFiles.map(f => f.getFilePath()));


        console.log(`📄 Scanning ${sourceFiles.length} source files in ${moduleName}`);

        const foundLocations: vscode.Location[] = [];

        sourceFiles.sort((a, b) => {
          const aName = path.basename(a.getFilePath()).toLowerCase();
          const bName = path.basename(b.getFilePath()).toLowerCase();
          return (aName === 'index.js' || aName === 'index.ts') ? -1 : 1;
        });


        for (const sourceFile of sourceFiles) {
          try {
            const filePath = sourceFile.getFilePath();



            // ⛔ Skip test files, node_modules, dist, etc.
            if (
              /(__tests__|\.test\.(js|ts|jsx|tsx)|node_modules|\.next|dist|build)/.test(filePath)
            ) {
              console.log(`🚫 Skipping test/build file: ${filePath}`);
              continue;
            }

            console.log(`🔍 Checking file: ${filePath}`);
            const exportedDeclarations = sourceFile.getExportedDeclarations();
            console.log(sourceFile);
            console.log(`exportedDeclarations ${exportedDeclarations}`);

            for (const [name, declarations] of exportedDeclarations) {
              // ✅ Match named export
              if (name === word && declarations.length) {
                const decl = declarations[0];
                const file = decl.getSourceFile();
                const line = decl.getStartLineNumber?.() ?? 1;
                return new vscode.Location(vscode.Uri.file(file.getFilePath()), new vscode.Position(line - 1, 0));
              }

              // ✅ Handle default export: match identifier within expression
              if (name === 'default') {
                for (const decl of declarations) {
                  let finalDecl = decl;
                  const symbol = decl.getSymbol();
                  const aliased = symbol?.getAliasedSymbol();
                  if (aliased) {
                    const aliasedDecls = aliased.getDeclarations();
                    if (aliasedDecls?.length) {
                      finalDecl = aliasedDecls[0] as typeof finalDecl;
                    }
                  }

                  // ✅ Check for function/class identifiers in expressions
                  const expr = (finalDecl as any).getExpression?.();
                  const exprName = expr?.getText?.();
                  const declName = finalDecl.getSymbol()?.getName?.();
                  const kind = expr?.getKindName?.() ?? '';

                  if (
                    word === 'default' ||
                    declName === word ||
                    exprName === word ||
                    /Identifier/.test(kind)
                  ) {
                    const file = finalDecl.getSourceFile();
                    const line = finalDecl.getStartLineNumber?.() ?? 1;
                    return new vscode.Location(vscode.Uri.file(file.getFilePath()), new vscode.Position(line - 1, 0));
                  }

                  // 🪪 Handle anonymous default export: log but continue
                  if (!declName && name === 'default') {
                    console.log(`ℹ️ Anonymous default export in: ${filePath}`);
                  }
                }
              }
            }

            console.log(`❌ Symbol '${word}' not found in ${filePath}`);
          } catch (err) {
            console.error(`🔥 Error in file ${sourceFile.getFilePath()}:`, err);
          }
        }


        if (foundLocations.length > 0) {
          console.log(`✅ Returning first match for '${word}'`);
          return foundLocations[0];
        } else {
          console.log(`❌ No matches found for '${word}' in any source file.`);
          return null;
        }


        console.log(`❌ Symbol '${word}' not found in exported declarations`);
        return null;
      }
    })
  );

  console.log('🚀 Extension "local-definition-linker" is now active!');
}


export function deactivate() { }
