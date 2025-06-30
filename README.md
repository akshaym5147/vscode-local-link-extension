# vscode-local-link-extension

A Visual Studio Code extension that enables `Ctrl+Click` (Go to Definition) for modules that are installed locally (as sibling folders) or published on npm, but where you also have the source code available. This is especially useful for debugging or developing with npm packages when you want to jump to the actual source code instead of the compiled dist files in node_modules.

---

## Features

- **Go to Definition** for locally linked modules/packages.
- Works with both JavaScript and TypeScript files.
- Supports default, named, and mixed imports.
- Ignores build, test, and node_modules folders for fast and relevant results.

---

## How It Works

When you `Ctrl+Click` `(or F12)` on an imported symbol, the extension:
1. Parses the import statement to find the module name.
2. Searches for a sibling folder with a matching package.json.
3. Scans the source files of that package for the exported symbol.
4. Jumps to the symbol’s definition if found.
5. If not found then jumps to the index file of that repository.

---

## Example

Suppose your folder structure is:
```
/my-monorepo
  /main-app
  /my-shared-lib
```

A published npm package called `my-shared-lib`.
Another project `main-app` that uses `my-shared-lib` as a dependency.
You want to debug or inspect methods from `my-shared-lib` while working in `main-app`, but `Ctrl+Click` in VS Code only jumps to the compiled code in `node_modules/dist`.
With this extension, if you keep both `my-shared-lib` (source) and `main-app` (consumer) side by side (as sibling folders), Ctrl+Click in `my-shared-lib` will jump to the actual source code in `my-shared-lib`, not the compiled output.

---

## Requirements

- Visual Studio Code 1.60.0 or higher
- Node.js (for development)
- Works with JavaScript and TypeScript

---

## Extension Settings

No custom settings required.

---

## Known Issues

- Only works for sibling folders (not for arbitrary paths).
- Only supports default and named exports (not re-exports or deep import chains).
- There can be any other issue, please feel free to raise.

---

## Development

1. Clone this repository.
2. Run `npm install`.
3. Press `F5` in VS Code to launch an Extension Development Host.
4. Test by opening a workspace with local sibling packages.

---

## Contributing

Pull requests and issues are welcome!

---

## License

MIT
