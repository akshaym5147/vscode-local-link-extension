// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('localModuleLinker.linkLocalModules', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const packageJsonPath = path.join(rootPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showErrorMessage('package.json not found in root.');
        return;
      }

      const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = Object.assign({}, pkgJson.dependencies, pkgJson.devDependencies);
      const found: string[] = [];

      for (const dep in dependencies) {
        const localPath = path.join(rootPath, '..', dep);
        if (fs.existsSync(localPath)) {
          found.push(`${dep} → ${localPath}`);
        }
      }

      if (found.length === 0) {
        vscode.window.showInformationMessage('No local modules found.');
      } else {
        vscode.window.showInformationMessage(`Linked Local Modules:\n${found.join('\n')}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['javascript', 'typescript'], {
      provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        // Dummy logic: redirect any function name "someFunc" to a local path
        if (word === 'someFunc') {
          const targetPath = path.join(vscode.workspace.rootPath || '', '../dsa/155MinStack.js');
          if (fs.existsSync(targetPath)) {
            return new vscode.Location(vscode.Uri.file(targetPath), new vscode.Position(0, 0));
          }
        }
        return null;
      },
    })
  );
}

export function deactivate() {}
