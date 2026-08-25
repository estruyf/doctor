# AGENTS.md

Guidance for AI coding agents (Claude Code, Copilot, Cursor, Codex, …) working in this repository.
Humans are welcome to read it too — it is the fastest description of how this project hangs together.

## What this is

`doctor` (`@estruyf/doctor`) is a CLI that publishes a folder of Markdown files as SharePoint pages —
a static site generator that outputs SharePoint pages instead of HTML files. It talks to SharePoint
through the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/) (`@pnp/cli-microsoft365`),
with a few direct REST calls where that CLI has no command.

Docs live at [getdoctor.io](https://getdoctor.io) and are built with [Astro Starlight](https://starlight.astro.build/)
from [docs/](docs/) — **not** Hugo (the site was migrated; ignore leftover Hugo-style paths referenced elsewhere).

Node.js >= 22.13.0. ESM (`"type": "module"`) — **relative imports must carry the `.js` extension**, even
from `.ts` sources. TypeScript 5, `module: nodenext`, `strictNullChecks` and `noUnusedLocals` are on.

## Commands

```bash
npm run build       # clean + tsc + tsc-alias   (tsc-alias rewrites the @-aliases in dist)
npm test            # build, then: node --test tests/**/*.test.mjs
npm run watch       # tsc -w + tsc-alias -w
npm run watch:debug # same, but patches bin/doctor to `node --inspect` + DEBUG=true
npm run docs        # astro dev — serve the Astro Starlight docs site from docs/
npm run docs:build  # npm install + astro build in docs/ (what the site deploy runs)
```

Run a single test file (tests import from `dist/`, so build first):

```bash
npm run build && node --test tests/locale.test.mjs
```

Tests are plain `node:test` `.mjs` files in [tests/](tests/) that import compiled helpers from `../dist/...`.
There is no linter and no test framework beyond the Node test runner — do not introduce one without being asked.

`npm link` makes the local build available as the global `doctor` command. The sample content repo is
[estruyf/doctor-sample](https://github.com/estruyf/doctor-sample) (what CI publishes against).

## Architecture

### Request flow

`bin/doctor` → [src/cli.ts](src/cli.ts) → [src/main.ts](src/main.ts) → a command class in [src/commands/](src/commands/).

Commands are the `Command` enum in [src/commands/Command.ts](src/commands/Command.ts):
`init`, `publish`, `workflow`, `status`, `version`, `setup`, `cleanup` (the last two wire up shell autocomplete).

1. [OptionsHelper](src/helpers/OptionsHelper.ts) reads `doctor.json` from `process.cwd()`, merges CLI
   arguments over it (`arg` package), then prompts via `inquirer` for anything still missing. Everything
   ends up in one flat `CommandArguments` object threaded through the whole run.
2. `Commands.start()` calls `resetRuntimeState()` and initializes `Logger`/`OutputHelper`/`CliCommand`/`PartialsHelper`,
   then dispatches on `options.task`.
3. Long-running commands (`publish`, `status`) render as a `listr2` task list. Each publish step is a task
   with an `enabled:` predicate driven by the options — that list in [publish.ts](src/commands/publish.ts) is
   the clearest description of the pipeline: clean → multilingual config → load state → collect markdown →
   precheck → pages → localized pages → remove deleted → navigation → site design → post cleanup → save state.

### Adding an option — three places, always

An option that is missing from any of these is silently ignored at runtime:

1. `OptionsHelper.getArgs()` — the `arg` definition (`--flag`).
2. `OptionsHelper.parseArguments()` — the merge, in the order **argument → `doctor.json` → default**.
   **Arguments always win over `doctor.json`.**
3. The matching interface in [src/models/CommandArguments.ts](src/models/CommandArguments.ts)
   (`RuntimeOptions`, `AuthOptions`, `PublishOptions`, `ContentOptions`, `NavigationOptions`,
   `SiteOptions`, `TaskToggleOptions`).

Nested `doctor.json` settings (`markdown.*`, `partials.*`, `multilingual.*`, `menu`, `siteDesign`) are
flattened here — e.g. `markdown.shortcodesFolder` becomes the top-level `shortcodesFolder`.

Then: update `schema/<version>.json` (the highest-numbered file in [schema/](schema/) is the current one)
and the docs page — see [Definition of done](#definition-of-done).

### Static classes with mutable state

Nearly every helper is a class of `static` methods holding module-level state (page cache, publish state,
counters, partials cache, rendered-diagram cache). This only works because `Commands.resetRuntimeState()`
clears them all at the start of a run — **any helper that keeps state must expose `reset()` and be added to
that list in [main.ts](src/main.ts)**, otherwise tests (and repeat runs in the same process) leak state
between cases. Tests call the compiled helpers directly, so a forgotten `reset()` shows up as an
order-dependent test failure.

### Output: one stdout writer

[OutputHelper](src/helpers/OutputHelper.ts) is the single place that writes to stdout. With `--output json`
the human-readable output has to disappear completely, and the run ends with exactly one JSON document
written by `flush()`. **Never `console.log` from a helper** — go through `OutputHelper`. Debug output goes
to stderr via `Logger`, so it never mixes with the parsed document. An unknown `--output` value throws
rather than falling back, so a typo can't hand a pipeline human output to parse.

### Publish state

[StateHelper](src/helpers/StateHelper.ts) stores `.doctor/state.json` **in the SharePoint asset library, not
on disk** (path relative to `--library`, configurable with `--stateFile`). It holds a SHA-256 hash per slug
of the resolved page source (front matter + content + partials). This drives three behaviours: skipping
unchanged pages, the `status` command's new/modified/unchanged/deleted/orphaned report, and `--removeDeleted`
(recycles pages present in state but absent locally — only with `--confirm`, and never when slugs cannot be
resolved for every file). `--forceAll` bypasses the hash check; `--disableStatePersistence` turns the whole
mechanism off. Anything that changes what a page renders from must feed the hash, or pages stop re-publishing.

### Multilingual

- A translation is identified **by file name**, not front matter: `*.lang.md` (`isLanguageFile`) and generated
  `*.machinetranslated.md` — see [isLanguageFile.ts](src/utils/isLanguageFile.ts). `type: translation` in front
  matter is documentation, not the source of truth — matching on it would let a translation collide with its
  source page's slug.
- Source pages link translations through `localization: { "nl-nl": ./page.nl.lang.md }`.
  [LocaleHelper](src/helpers/LocaleHelper.ts) maps those culture names to the LCIDs `multilingual.languages`
  and SharePoint use.
- Translations are processed in a **separate pipeline step after all normal pages** — SharePoint can only
  create a translation once the source page exists.
- [Translator](src/helpers/Translator.ts) calls the Azure Translator Text API (key via `multilingual.translator`,
  `TRANSLATOR_KEY` in CI).

### Markdown → SharePoint

- [DoctorTranspiler](src/helpers/DoctorTranspiler.ts) is the core: parses front matter (`gray-matter`),
  resolves partials, renders Markdown (`markdown-it` + plugins), post-processes the HTML with `cheerio`,
  uploads referenced images, and drives [PagesHelper](src/helpers/PagesHelper.ts) to create/update the page
  and its controls.
- [PartialsHelper](src/helpers/PartialsHelper.ts) resolves `<include file="..." />` plus the configured
  `partials.header`/`partials.footer`, rewrites relative links inside included snippets, and contributes to
  the page hash so a changed partial re-publishes its pages.
- [ShortcodesHelpers](src/helpers/ShortcodesHelpers.ts) loads the built-in shortcodes from
  [src/shortcodes/](src/shortcodes/) (callout, icon, table of contents, mermaid) and user shortcodes from
  `markdown.shortcodesFolder`. These only apply when `markdown.allowHtml` is enabled.
- [MermaidHelper](src/helpers/MermaidHelper.ts) renders diagrams **during publish**, in the Mermaid version
  this package ships, and uploads them as images to a `mermaid` folder in the asset library — SharePoint
  strips inline SVG and never executes the script tag. Diagram types that need a real browser
  (`mindmap`, `C4Context`, `block-beta`) are left to SharePoint.
- [TempDataHelper](src/helpers/TempDataHelper.ts) writes scratch files to `./temp` for command payloads,
  generated assets and machine-translated pages; it cleans up at the end of `cli()`, including on failure.

### Talking to SharePoint

- [RunCommand.ts](src/helpers/RunCommand.ts) `executeWithRetry()` is the single choke point. For
  `m365`/`localm365` it calls `executeCommand()` in-process; any other `--commandName` is spawned as a child
  process with the options serialized to argv. Both paths enforce `CliCommand.getTimeout()` (default 120s)
  and one 5s-delayed retry when `--retryWhenFailed` is set. Add new SharePoint calls here, not with ad-hoc
  `spawn`/`exec`.
- [ApiHelper](src/helpers/ApiHelper.ts) + [AccessToken](src/helpers/AccessToken.ts) cover the direct REST
  calls. Use the `*OrThrow` variants when a call must succeed — the plain ones swallow the SharePoint error
  message.
- [Authenticate](src/commands/authenticate.ts) handles login; a `--certificate` value ending in
  `.pfx`/`.p12`/`.pem` is treated as a file path, anything else as base64 contents.

### Logging secrets

Never pass raw options to output. `Logger.debug(Logger.redact(options))` redacts by property name (see
`SECRET_FIELDS`), and `Logger.mask(message, secrets)` scrubs known secret values out of error messages.
Debug output goes to stderr and is enabled with `--debug` or `DEBUG=true`. A new secret-carrying option
must be added to `SECRET_FIELDS`.

### Documentation site

An [Astro Starlight](https://starlight.astro.build/) site with its own `package.json` in [docs/](docs/)
(`astro`, `@astrojs/starlight`, `sharp`) — separate from the CLI's dependencies.

- Content is Markdown/MDX under [docs/src/content/docs/](docs/src/content/docs/), grouped as
  `docs/getting-started`, `docs/content`, `docs/cli`, `docs/configuration`, `docs/ci-cd`, `docs/about`,
  plus top-level `showcase/` and `changelog/`. Every page needs Starlight front matter (`title`, `description`).
- The sidebar in [docs/astro.config.mjs](docs/astro.config.mjs) is **hand-maintained, not autogenerated** —
  a new page is invisible until it is added there.
- Renaming or moving a page means adding an entry to the `redirects` map in the same file; that is why the
  existing map is long, and old URLs must keep working.
- [docs/src/content/docs/changelog/index.md](docs/src/content/docs/changelog/index.md) is **generated** by
  `scripts/prepare-changelog.js` from [changelog.json](changelog.json) — never edit it by hand.

## Conventions

- **Path aliases**: `@commands`, `@helpers`, `@models`, `@utils` resolve to the barrel `index.ts` of each
  folder (tsconfig `paths`, rewritten at build time by `tsc-alias`). **A new file must be exported from its
  folder's `index.ts`** or the alias import fails. Inside a folder, import siblings by relative `./File.js`
  path to avoid circular barrel imports.
- **Config schema**: `doctor.json` options are documented in `schema/<version>.json`; adding an option means
  updating the current schema file.
- **Changelog**: add entries to [changelog.json](changelog.json) — a new version object goes directly below
  the `template` entry, `id` = GitHub issue number or `null`. The husky `pre-commit` hook regenerates
  `CHANGELOG.md` and the docs changelog from it, and resets the debug shebang in `bin/doctor`.
- **Comments** explain *why* a non-obvious decision was made (see the state-file, locale, output and
  access-token helpers) rather than restating the code. Public helper methods carry JSDoc.
- **Releases** publish from the `dev` branch: a commit message containing `#release` triggers the npm publish
  workflow, and pushes from `dev` publish under the `next` tag (a full release comes from a published GitHub
  release or a manual run). CI also runs a real publish against the `doctor-sample` site on macOS and Ubuntu.

## Definition of done

**Documentation is part of the change, not a follow-up.** Ship it in the same commit:

| Change | Also update |
| --- | --- |
| new/changed/removed CLI option | [docs/src/content/docs/docs/configuration/cli-options/](docs/src/content/docs/docs/configuration/cli-options/) **and** `schema/<version>.json`, plus `doctor-json/` if it is a `doctor.json` option |
| new/changed command | [docs/src/content/docs/docs/cli/](docs/src/content/docs/docs/cli/) |
| new shortcode | a page under [docs/src/content/docs/docs/content/shortcodes/](docs/src/content/docs/docs/content/shortcodes/) **and** a sidebar entry |
| changed front matter, partials or multilingual behaviour | the matching page under `docs/content/` |
| any user-visible change | an entry in [changelog.json](changelog.json) |
| moved/renamed docs page | a `redirects` entry in [docs/astro.config.mjs](docs/astro.config.mjs) |

Before calling a change done:

1. `npm test` passes (it builds first, so it also catches type errors).
2. New state-holding helpers are in `resetRuntimeState()`.
3. `npm run docs` renders the touched page and its sidebar link works.
4. Keep this file and `CLAUDE.md` accurate when commands, structure or conventions move.

## Things not to do

- Don't edit `CHANGELOG.md` or `docs/src/content/docs/changelog/index.md` — they are generated.
- Don't commit the `bin/doctor` debug shebang (`node --inspect`) — `scripts/reset-debug.js` in the pre-commit
  hook resets it; don't fight it.
- Don't `console.log` from helpers, and don't log raw options or errors that may carry secrets.
- Don't drop the `.js` extension on relative imports.
- Don't add a linter, test framework or dependency that isn't asked for; the dependency versions in
  `package.json` are pinned exactly on purpose.
- Don't commit, push, or publish unless asked — `#release` in a commit message triggers a real npm publish.
