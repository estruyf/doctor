# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`doctor` (`@estruyf/doctor`) is a CLI that publishes a folder of Markdown files as SharePoint pages — a static site generator that outputs SharePoint pages instead of HTML files. It talks to SharePoint through the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/) (`@pnp/cli-microsoft365`), with a few direct REST calls where the CLI has no command. Docs live at [getdoctor.io](https://getdoctor.io) and are built with [Astro Starlight](https://starlight.astro.build/) from [docs/](docs/) — **not** Hugo (the site was migrated; ignore any leftover Hugo-style paths you may see referenced elsewhere).

Node.js >= 22.13.0. ESM (`"type": "module"`) — relative imports must carry the `.js` extension, even from `.ts` sources.

## Commands

```bash
npm run build      # clean + tsc + tsc-alias  (tsc-alias rewrites the @-aliases in dist)
npm test           # build, then: node --test tests/**/*.test.mjs
npm run watch      # tsc -w + tsc-alias -w
npm run watch:debug # same, but patches bin/doctor to `node --inspect` + DEBUG=true
npm run docs       # astro dev — serve the Astro Starlight docs site from docs/
npm run docs:build # npm install + astro build in docs/ (what the site deploy runs)
```

Run a single test file (tests import from `dist/`, so build first):

```bash
npm run build && node --test tests/locale.test.mjs
```

Tests are plain `node:test` `.mjs` files that import compiled helpers from `../dist/...`. There is no linter and no test framework beyond the Node test runner.

`npm link` makes the local build available as the global `doctor` command; the sample content repo is [estruyf/doctor-sample](https://github.com/estruyf/doctor-sample) (what CI publishes against).

## Architecture

### Request flow

`bin/doctor` → [src/cli.ts](src/cli.ts) → [src/main.ts](src/main.ts) → a command class in [src/commands/](src/commands/).

1. [OptionsHelper](src/helpers/OptionsHelper.ts) reads `doctor.json` from `process.cwd()`, merges CLI arguments over it (`arg` package), then prompts via `inquirer` for anything still missing. Every option ends up in a single flat `CommandArguments` object that is threaded through the whole run — **arguments always win over `doctor.json`**, and every new option has to be added in three places: `getArgs()`, `parseArguments()`, and the `CommandArguments` model.
2. `Commands.start()` calls `resetRuntimeState()` and initializes `Logger`/`CliCommand`/`PartialsHelper`, then dispatches on `options.task` against the `Command` enum.
3. Long-running commands (`publish`, `status`) render as a `listr2` task list. Each publish step is a task with an `enabled:` predicate driven by the options — that list in [publish.ts](src/commands/publish.ts) is the clearest description of the pipeline.

### Static classes with mutable state

Nearly every helper is a class of `static` methods holding module-level state (page cache, publish state, counters, partials cache). This only works because `Commands.resetRuntimeState()` clears them all at the start of a run — **any helper that keeps state must expose `reset()` and be added to that list in [main.ts](src/main.ts)**, otherwise tests (and repeat runs in the same process) leak state between cases.

### Publish state

[StateHelper](src/helpers/StateHelper.ts) stores `.doctor/state.json` **in the SharePoint asset library, not on disk** (path is relative to `--library`, configurable with `--stateFile`). It holds a SHA-256 hash per slug of the resolved page source (front matter + content + partials). This drives three behaviours: skipping unchanged pages, the `status` command's new/modified/unchanged/deleted/orphaned report, and `--removeDeleted` (which recycles pages present in state but absent locally — only with `--confirm`, and never when slugs cannot be resolved for every file). `--forceAll` bypasses the hash check; `--disableStatePersistence` turns the whole mechanism off.

### Multilingual

- A translation is identified **by file name**, not by front matter: `*.lang.md` (`isLanguageFile`) and generated `*.machinetranslated.md` (see [isLanguageFile.ts](src/utils/isLanguageFile.ts)). `type: translation` in front matter is documentation, not the source of truth — matching on it would let a translation collide with its source page's slug.
- Source pages link translations through `localization: { "nl-nl": ./page.nl.lang.md }`. [LocaleHelper](src/helpers/LocaleHelper.ts) maps those culture names to the LCIDs `multilingual.languages` and SharePoint use.
- Translations are processed in a **separate pipeline step after all normal pages** — SharePoint can only create a translation once the source page exists.
- [Translator](src/helpers/Translator.ts) calls the Azure Translator Text API for machine translation (key via `multilingual.translator`, `TRANSLATOR_KEY` in CI).

### Markdown → SharePoint

[DoctorTranspiler](src/helpers/DoctorTranspiler.ts) is the core: it parses front matter (`gray-matter`), resolves partials, renders Markdown (`markdown-it` + plugins), post-processes the HTML with `cheerio`, uploads referenced images, and drives [PagesHelper](src/helpers/PagesHelper.ts) to create/update the page and its controls.

[PartialsHelper](src/helpers/PartialsHelper.ts) resolves `<include file="..." />` plus the configured `partials.header`/`partials.footer`, rewrites relative links inside included snippets, and contributes to the page hash so a changed partial re-publishes its pages.

[ShortcodesHelpers](src/helpers/ShortcodesHelpers.ts) loads the built-in shortcodes from [src/shortcodes/](src/shortcodes/) and user shortcodes from `markdown.shortcodesFolder`; these only apply when `markdown.allowHtml` is enabled.

### Talking to SharePoint

- [RunCommand.ts](src/helpers/RunCommand.ts) `executeWithRetry()` is the single choke point. For `m365`/`localm365` it calls `executeCommand()` in-process; any other `--commandName` is spawned as a child process with the options serialized to argv. Both paths enforce `CliCommand.getTimeout()` (default 120s) and one 5s-delayed retry when `--retryWhenFailed` is set.
- [ApiHelper](src/helpers/ApiHelper.ts) + [AccessToken](src/helpers/AccessToken.ts) cover the direct REST calls. Use the `*OrThrow` variants when a call must succeed — the plain ones swallow the SharePoint error message.
- [Authenticate](src/commands/authenticate.ts) handles login; a `--certificate` value ending in `.pfx`/`.p12`/`.pem` is treated as a file path, anything else as base64 contents.

### Documentation site

The docs are an [Astro Starlight](https://starlight.astro.build/) site with its own `package.json` in [docs/](docs/) (`astro`, `@astrojs/starlight`, `sharp`) — separate from the CLI's dependencies.

- Content is Markdown/MDX under [docs/src/content/docs/](docs/src/content/docs/), grouped as `docs/getting-started`, `docs/content`, `docs/cli`, `docs/configuration`, `docs/ci-cd`, `docs/about`, plus top-level `showcase/` and `changelog/`. Every page needs Starlight front matter (`title`, `description`).
- The sidebar in [docs/astro.config.mjs](docs/astro.config.mjs) is **hand-maintained, not autogenerated** — a new page is invisible until it is added there.
- Renaming or moving a page means adding an entry to the `redirects` map in the same file; that is why the existing map is long, and old URLs must keep working.
- [docs/src/content/docs/changelog/index.md](docs/src/content/docs/changelog/index.md) is **generated** by `scripts/prepare-changelog.js` from [changelog.json](changelog.json) — never edit it by hand.

**Documentation is part of the change, not a follow-up.** Any change to CLI behaviour ships with its docs update in the same commit:

- new/changed/removed CLI option → [docs/src/content/docs/docs/configuration/cli-options/](docs/src/content/docs/docs/configuration/cli-options/) **and** `schema/<version>.json`, plus `doctor-json/` if it is a `doctor.json` option
- new/changed command → [docs/src/content/docs/docs/cli/](docs/src/content/docs/docs/cli/)
- new shortcode → a page under [docs/src/content/docs/docs/content/shortcodes/](docs/src/content/docs/docs/content/shortcodes/) and a sidebar entry
- changed front matter, partials, or multilingual behaviour → the matching page under `docs/content/`
- user-visible change → an entry in [changelog.json](changelog.json)

Run `npm run docs` and check the page renders and the sidebar link works before considering the change done. Keep this file (CLAUDE.md) accurate too when commands, structure, or conventions move.

### Logging secrets

Never pass raw options to output. `Logger.debug(Logger.redact(options))` redacts by property name (see `SECRET_FIELDS`), and `Logger.mask(message, secrets)` scrubs known secret values out of error messages. Debug output goes to stderr and is enabled with `--debug` or `DEBUG=true`.

## Conventions

- **Path aliases**: `@commands`, `@helpers`, `@models`, `@utils` resolve to the barrel `index.ts` of each folder (tsconfig `paths`, rewritten at build time by `tsc-alias`). New files must be exported from their folder's `index.ts`.
- **Config schema**: `doctor.json` options are documented in `schema/<version>.json`. Adding an option means updating the current schema file.
- **Docs stay in sync**: every user-visible change updates the Astro Starlight docs in the same commit — see [Documentation site](#documentation-site) for which page belongs to what.
- **Changelog**: add entries to [changelog.json](changelog.json) (newest version object below the `template` entry, `id` = GitHub issue number or `null`). The husky `pre-commit` hook regenerates `CHANGELOG.md` and `docs/src/content/docs/changelog/index.md` from it, and resets the debug shebang in `bin/doctor`.
- **Comments** explain *why* a non-obvious decision was made (see the state-file, locale, and access-token helpers) rather than restating the code. Public helper methods carry JSDoc.
- **Releases** publish from the `dev` branch: a commit message containing `#release` triggers the npm publish workflow; `dev` pushes publish a `next` tag. CI also runs a real publish against the `doctor-sample` site on macOS and Ubuntu.
