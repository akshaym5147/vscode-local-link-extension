import * as vscode from "vscode";
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
    // console.log("provideDefinition triggered for", document.fileName);

    const wordRange = document.getWordRangeAtPosition(position);
    const symbol = document.getText(wordRange);

    const line = document.lineAt(position.line).text;
    const importPathMatch = line.match(
      /import\s+(?:\{[^}]*\}\s+from\s+|[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/
    );

    if (!importPathMatch) {return null;}

    const importPath = importPathMatch[1];
    const currentFilePath = document.uri.fsPath;
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    // console.log("Import path:", importPath);
    // console.log("Current file path:", currentFilePath);
    // console.log("Workspace root:", workspaceRoot);

    if (!workspaceRoot) {return null;}

    const resolvedPath = await resolveSymbolPath(importPath, symbol, workspaceRoot);
    // console.log('Resolved path:', resolvedPath);
    if (!resolvedPath) {return null;}
    return new vscode.Location(vscode.Uri.file(resolvedPath), new vscode.Position(0, 0));
  }
}
