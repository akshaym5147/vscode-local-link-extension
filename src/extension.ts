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
    // Get the word at the position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {return null;}
    const symbol = document.getText(wordRange);

    // Find the import statement for the symbol in the whole document
    const text = document.getText();
    const importRegex = new RegExp(
      `import\\s+(?:\\{[^}]*\\}\\s+from\\s+|[\\w*\\s{},]+\\s+from\\s+)?["']([^"']+)["']`,
      "g"
    );
    let importPath: string | undefined;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(text))) {
      // Optionally, you could check if the symbol is in the import statement
      if (match[0].includes(symbol)) {
        importPath = match[1];
        break;
      }
    }
    if (!importPath) {return null;}

    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)
      ?.uri.fsPath;
    if (!workspaceRoot) {return null;}

    try {
      const resolvedPath = await resolveSymbolPath(importPath, symbol, workspaceRoot);
      if (!resolvedPath) {return null;}
      return new vscode.Location(
        vscode.Uri.file(resolvedPath),
        new vscode.Position(0, 0)
      );
    } catch (e) {
      console.error("Error resolving symbol path:", e);
      return null;
    }
  }
}
