import { defineConfig } from 'vitest/config';
import path from 'path';

// The real `vscode` module only exists inside the VS Code extension host, so
// unit tests need a stand-in when they import modules that reference it
// (mainly for types/small helpers, e.g. src/utils/frontmatter.ts).
export default defineConfig({
  test: {
    alias: {
      vscode: path.resolve(import.meta.dirname, 'test/mocks/vscode.ts'),
    },
  },
});
