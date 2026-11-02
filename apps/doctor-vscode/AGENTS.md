# AGENTS.md — the VS Code extension

Guidance for AI coding agents working in `apps/doctor-vscode`. The repository-wide rules in the root
[AGENTS.md](../../AGENTS.md) apply too, except where this file says otherwise.

## What this is

**Doctor: Metadata Editor** (`doctor-metadata`), a VS Code extension that edits what doctor reads: a side
panel for a page's front matter (SharePoint columns with taxonomy and people pickers, navigation,
shortcode completion) and a form editor for `doctor.json`. It can also start `doctor publish` and
`doctor status` as VS Code tasks. It never imports the CLI: it runs the `doctor` command and reads the
same files.

## Commands

Install from the repository root (`npm install`), then in this folder:

```bash
npm run compile     # tsc6 --noEmit + eslint + esbuild (what vscode:prepublish runs)
npm run watch       # esbuild --watch
npm test            # vitest, once
npm run package     # vsce package --no-dependencies, a .vsix to install by hand
```

`F5` on **Run the extension** in the root `.vscode/launch.json` opens the Extension Development Host.

## Layout

```text
src/extension.ts      activation: commands, providers, the panel
src/panel/            the side panel webview (React), PanelProvider is its host side
src/config/           the doctor.json custom editor: ConfigEditorProvider and the form model
src/config-editor/    the doctor.json form (React)
src/auth/             certificate sign-in from doctor.json, fallback device code sign-in
src/graph/, src/sharepoint/   term store, users, the column schema
src/shortcodes/       shortcode completion
src/utils/            front matter parsing, doctorMappings, doctor.json discovery
test/                 vitest; test/mocks/vscode.ts stands in for the vscode module
```

esbuild bundles three entry points into `dist/`: `extension.js` (Node, CommonJS) and `panel.js` and
`config-editor.js` (browser). Everything the extension uses at runtime is in those bundles.

## Conventions that differ from the CLI

- **CommonJS, no `.js` extension on imports**, React for the webviews, `strict: true`.
- **ESLint is allowed here, and only here.** It came with the extension and runs in `compile`. Don't add it
  to the CLI.
- **vitest**, not `node:test`. The two runners stay separate on purpose.
- Type checking runs as **`tsc6`**, for the reason in the root AGENTS.md.
- `@types/vscode` stays equal to `engines.vscode`, so the compiler rejects API the oldest supported VS Code
  lacks. Raise both together.
- Dependencies are pinned exactly, as in the rest of the repository.

## The contract with doctor

The extension writes what doctor reads, so parts of it describe doctor's behaviour and have to change with
it. The list of those pairs is in
[.github/plans/monorepo-restructure.md](../../.github/plans/monorepo-restructure.md#until-then-the-copies-are-kept-in-sync-by-hand).
A change to either side of a pair without the other is a bug that only shows when a page is published.

The `doctor.json` schema is the exception: the editor imports `schema/2.1.0.json` from the repository
root, so it is never copied. Point the import at the new file when the schema version moves.

## Publishing

`vsce publish` needs a `publisher`, which is not set yet: it becomes part of the extension's permanent
Marketplace id, so its owner picks it. [vscode.yml](../../.github/workflows/vscode.yml) packages the
extension on every change and publishes it from a GitHub release tagged `doctor-vscode@<version>`.

## Definition of done

- `npm test` and `npm run compile` pass (lint warnings are fine, errors are not).
- [README.md](README.md) is the Marketplace page: user-visible changes go there.
- The docs page [docs/vscode-extension](../../docs/src/content/docs/docs/vscode-extension/index.md) covers
  what a doctor user needs to know about the extension.
