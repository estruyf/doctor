// Minimal stand-in for the `vscode` module, only usable in unit tests (vitest).
// The real `vscode` package only exists inside the VS Code extension host, so
// Node can't resolve it when running tests directly. This mock provides just
// enough surface (constructible classes with the shapes our code touches) for
// modules that import `vscode` for types/small helpers to load under vitest.
// It is aliased in via vitest.config.ts — never bundled into the extension.

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    if (typeof a === "number") {
      this.start = new Position(a, b as number);
      this.end = new Position(c as number, d as number);
    } else {
      this.start = a;
      this.end = b as Position;
    }
  }
}

export class WorkspaceEdit {
  private edits: { uri: unknown; range: Range; newText: string }[] = [];

  replace(uri: unknown, range: Range, newText: string) {
    this.edits.push({ uri, range, newText });
  }
}

export const workspace = {
  applyEdit: async (_edit: WorkspaceEdit) => true,
  getConfiguration: () => ({
    get: () => undefined,
    update: async () => undefined,
  }),
};

export const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
};
