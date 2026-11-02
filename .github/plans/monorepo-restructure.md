# Plan: one repository for the CLI and the metadata extension

Status: agreed in principle. Step 1 is done (#209 merged), step 2 is next. Audited against both
repositories on 2026-11-02
Context: @estruyf asked for the **Doctor Metadata** VS Code extension
([involv-intranet/sharepoint-front-matter-vscode](https://github.com/involv-intranet/sharepoint-front-matter-vscode))
to be merged into this repository. The code comes over as a clean copy; its history stays in the
original repo.
Related: the metadata, `author` and page template work in 2.3.0 is what the extension exists to
drive — see [webpart-shortcodes.md](webpart-shortcodes.md) for the other half of that release.

## Why

The extension writes the front matter `doctor` reads. That contract currently lives in two places:

- this repository, in the front matter parsing and the `metadata` transforms;
- the extension, in a hand-maintained `src/utils/doctorMappings.ts` — 133 lines naming every
  front matter key, its SharePoint internal name, its fallback type and how a person field is
  resolved.

Nothing keeps them in step, and the drift has already started: that file's own header cites
`doctor-tools/doctor`, which is not where this project lives. A change to the contract on one side
is invisible to the other until somebody publishes a page and reads the result.

It already happened with 2.3.1. The HTML page mode (#205) added `pageMode`, `html` and a new
`overwriteImages` description to the schema, and a `homepage` front matter key. The extension's
schema copy and `doctorMappings.ts` have none of them.

That is the same failure this release spent its review passes on — `status` and `publish` each
computing "has this page changed" separately until one quietly stopped matching the other. The fix
there was one entry point both call. The fix here is the same shape, and it needs one repository
before it can be written.

Shared documentation is the second reason. The extension is unusable without a valid `doctor.json`,
so its pages belong downstream of the configuration pages rather than in a site of their own.

## Structure

```text
package.json              private workspace root, no code of its own
docs/                     stays put, not a workspace — the site serves both packages
schema/                   stays put — see below, this is a published URL
assets/                   repository-level images
.github/ .husky/          repository-wide
apps/
  doctor/                 @estruyf/doctor — src, bin, dist, tests, scripts
  doctor-vscode/          The VS Code extension for the doctor
packages/
  common/                 later — the shared contract
```

**npm workspaces, not turborepo/nx/changesets.** The repository is already two packages — `docs/`
has always had its own `package.json` — so workspaces is the thing that was missing rather than a
new layer. It ships with npm, which matters here: `AGENTS.md` says not to add tooling nobody asked
for.

The heavier tools have nothing to work with. Turborepo and nx pay for themselves on a **build
graph**, and there is none: the extension never imports the CLI. Changesets pays for itself on
**coordinated versioning**, and there is none either — the CLI publishes to npm from `dev` on a
`#release` commit message, the extension publishes to the Visual Studio Marketplace through `vsce`.
Different registries, different cadences, no shared version number.

### `docs/` and `schema/` stay at the repository root

`docs/` is a site, not a publishable package. Its deploy and its long `redirects` map already point
at that path, and moving it buys nothing. It gains a sidebar group for the extension, downstream of
the configuration pages.

It stays **out** of the workspaces. Vercel builds it from `docs/` with its own `npm install` and its
own lockfile ([docs/vercel.json](../../docs/vercel.json)). As a workspace, that install would run at
the root and pull in the CLI's and the extension's dependencies too, and `npm run docs:build` (`cd
docs && npm install`) would install the whole repository. Nothing is gained in return, since the site
imports neither package.

`schema/` **must not move**, and this is the one hard constraint in the whole plan. The schema is
addressed by URL:

```url
https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.1.0.json
```

That URL is written into every user's `doctor.json` by `doctor init`
([src/commands/init.ts](../../src/commands/init.ts)), documented on two configuration pages, and is
the `$id` inside the schema files themselves, across six versions. Moving the folder 404s it the
moment the move lands on `dev`, and every existing project silently loses editor validation. It is
a published contract, not an implementation detail.

Keeping it at the root is also simply correct: the extension reads `doctor.json` too, so the schema
is shared by both packages. If it needs to be importable rather than read by relative path, give
`schema/` its own `package.json` and list it as a workspace — the files never move, so the URL keeps
working.

Unrelated to the move, but found while checking the `$id`s: `schema/1.12.0.json` has the `$id` of
`1.2.0.json`.

### Two shared contracts, kept apart

| | Describes | How it is shared |
| --- | --- | --- |
| `schema/*.json` | the shape of `doctor.json` | stays at the root; already published over HTTP |
| `packages/common` | the shape of page **front matter**, and the **shortcodes** doctor ships | new package, imported by both |

The schema and the package are not the same thing and should not become one: the first is
configuration consumed by editors over HTTP, the second is code.

`packages/common` holds more than the front matter contract: the built-in shortcode list belongs
there too, and so does anything else the two sides have to agree about.

### Until then, the copies are kept in sync by hand

The decision is to let them diverge-by-copy for now rather than block the extension's features on
the restructure. These are the files that have to be changed together, and the list is worth keeping
accurate as it grows:

| In this repository | In the extension |
| --- | --- |
| front matter keys and the `metadata` transforms | `src/utils/doctorMappings.ts` |
| `src/shortcodes/`, `ShortcodeKind` | `src/shortcodes/ShortcodeRegistry.ts` — the `BUILT_IN` list and the `kind` values |
| `schema/2.1.0.json` | `src/config/doctor-schema.json` — a byte-for-byte copy the `doctor.json` editor is built from |
| `src/commands/Command.ts`, the `--forceAll` option | `src/commands/runDoctor.ts` — `DOCTOR_RUNS`, the commands and flags the editor starts |
| `CERTIFICATE_PASSWORD_ENV` in `OptionsHelper` | `src/commands/runDoctor.ts` — the variable the stored certificate password is handed over in |
| `LCID_BY_LOCALE` in `LocaleHelper` | `src/config/languages.ts` — `DOCTOR_LOCALES`, the `doctor.json` editor's language list when SharePoint cannot be asked |
| how `OptionsHelper`, `SiteHelpers.resolveLogoPath` and `PartialsHelper.getPartialPath` resolve a path setting | `src/config/pathFields.ts` — `PATH_FIELDS`, which form the editor's Browse button writes each path in |
| the static item rules in `NavigationHelper` — the `parent` normalisation, the nameless-item skip, the weight sort | `src/config/menuItems.ts` — the warnings the `menu.*.items` editor shows, and the ids the side panel offers as a page's `parent` |

The locale table matters beyond the editor. When signed in, the editor lists the languages SharePoint
itself offers, which can include ones this table lacks; doctor accepts those by LCID but fails on
their *names*, which is why the editor writes LCIDs. A language missing here is therefore a gap in
doctor's `localization` front matter as well — a page cannot name it as a locale — and comparing the
table against SharePoint's live list is the way to find them.

The schema row is the one copy that can be checked mechanically, because it is meant to be identical:
`cmp schema/2.1.0.json <extension>/src/config/doctor-schema.json` says whether it has drifted. It
also showed the value of the copy being exercised: rendering the editor from it surfaced a
`pageTemplate` default of `"doctor-placeholder"`, copied by mistake from `webPartTitle`, which had
been in the published schema — and in every editor's IntelliSense for `doctor.json` — since August.
Fixed on both sides in this release.

That check fails today: the copy misses `pageMode`, `html` and the new `overwriteImages` text from
#205. It is also the one row the move fixes for free. Once both live in one repository, esbuild can
bundle `../../schema/2.1.0.json` straight into the extension, so PR B deletes the copy instead of
syncing it.

The last two rows copy *behaviour* rather than a list, which makes them the easiest to break without
noticing: the editor warns about what doctor does, so a change to how doctor resolves a path or
builds the navigation turns those warnings into wrong advice. Both were written from the code, and
both found a gap in it along the way — the `/x` partial form the docs describe was read as an absolute
path (fixed in 2.3.0), and a static `id` with capitals or spaces can never be a page's `parent`.

A change to either side of a row without the other is a bug which does not show up until a page is
published.

## What the move breaks

|                               |                                                           |
| ----------------------------- | --------------------------------------------------------- |
| `.github/workflows/*.yml` (4) | none use `working-directory` today — all assume the root  |
| `npm start` / `npm link` in CI | the root is a private package without a `bin`, so both need `-w @estruyf/doctor` |
| `.husky/pre-commit`           | runs `node ./scripts/prepare-changelog.js`, root relative |
| `prepare-changelog.js`        | writes `CHANGELOG.md` to the cwd and the docs page through `../docs/`, both shift |
| `prepare-sample.js`           | resolves `../doctor-sample` from its own folder, but CI clones the sample into the root |
| `update-package-version.js`   | edits the `package.json` in the cwd                       |
| npm publish                   | the `#release` flow needs `-w @estruyf/doctor`            |
| npm provenance                | `repository` needs `"directory": "apps/doctor"`           |
| `readme.md`, `LICENSE`        | npm only packs them from the package folder, so `apps/doctor` needs its own or the npm page goes blank |
| husky `prepare`               | moves to the root `package.json`. `husky install` is deprecated in husky 9, it becomes `husky` |
| a local `npm link`            | re-run from the package directory                         |
| `tsconfig` + `tsc-alias`      | the `@helpers`/`@models` aliases are package relative     |
| `.vscode/launch.json`         | both repositories have one. `${workspaceFolder}` becomes the root, so they merge into one with `apps/...` paths. The extension's "Extension Tests" entry points at a `dist/test` that does not exist |
| `.github/plans/*.md`          | the relative links into `src/`                            |
| `AGENTS.md` / `CLAUDE.md`     | the command table and every path in it                    |

Two more only break once the extension is in, so they belong to PR B:

- **`main.yml` publishes the CLI on every published GitHub release.** An extension release would
  publish doctor to npm. Releases need a tag per package (`doctor@2.4.0`, `doctor-vscode@0.2.0`) and
  the workflow a gate on its own prefix.
- **`release.yml` and `test-run.yml` run on every push to `dev`.** That is four real publishes against
  the sample site for a change that only touches the extension. Both need a `paths` filter.

## Packaging the extension

`vsce` is the Visual Studio Marketplace tool: `vsce package` builds a `.vsix` (a zip plus manifest),
`vsce publish` uploads it. Things to settle while moving it, all of them broken today rather than
broken by the move:

- **There is no `publisher` field**, so `vsce package` cannot succeed as the extension stands. It
  becomes part of the extension's permanent Marketplace id (`publisher.doctor-metadata`), so it is
  worth agreeing before the first publish rather than after. The same goes for the `doctor-metadata.*`
  setting keys, which users end up with in their settings.
- **There is no `.vscodeignore`**, so the `.vsix` ships `src/`, `test/` and `tsconfig.json`.
- **There is no `vscode:prepublish` script**, so `vsce package` ships whatever is in `dist/`, which
  can be an unminified watch build. It should run `node esbuild.js`.
- **No `repository`, no `LICENSE`, no Marketplace `icon`.** vsce warns about the first two. The icon
  has to be a PNG, and `media/icon.svg` is only the activity bar icon.
- **The dependencies use `^` ranges.** This repository pins exact versions, so they get pinned on the
  way in. `@types/vscode` matters most: it resolves to 1.137 while `engines.vscode` says `^1.85.0`, so
  the compiler accepts API calls that the oldest supported VS Code does not have. It should match
  `engines`.
- **It has ESLint**, as part of `npm run compile`. `AGENTS.md` says no linter. Keep it for the
  extension only and say so in a nested `AGENTS.md`/`CLAUDE.md` in `apps/doctor-vscode`, which also
  holds the rest of its conventions (CommonJS, React, vitest).

The copy itself: take the tracked files (`git archive main`), not the folder. `.impeccable/` is only
hidden through `.git/info/exclude`. The only other branch, `dmitriyvde-fix-front-matter-parsing`, is
a stray copy of the GitHub "Initial commit" with no shared history, so there is nothing to bring.

`vsce` is also the one tool that dislikes workspaces: it walks the extension's own `node_modules` to
decide what to ship, and workspaces hoist those to the root. The extension already bundles its six
runtime dependencies into `dist/extension.js` with esbuild, so `vsce package --no-dependencies` is
the answer — the bundle is self contained and there is nothing for it to go looking for.

## Do the publish allowlist first, separately

`.npmignore` denies `src`, `docs`, `schema`, `scripts` and more — and has never mentioned `tests`.
`npm pack --dry-run` on 2.3.0 (by 2.3.1 it is 36 test files):

|                                      |                                         |
| ------------------------------------ | --------------------------------------- |
| `dist/`                              | 300 files, correct                      |
| `tests/`                             | **28 files, shipped to every consumer** |
| `bin/`                               | 2 files, correct                        |
| `AGENTS.md`, `CLAUDE.md`             | AI tooling instructions, shipped        |
| `cypress.sample.json`, `.templates/` | strays                                  |

It also grew during this release: the five suites added for the review passes went straight into the
published package without anyone touching the ignore file. That is what a denylist does — a new
sibling ships by default and nothing says so.

```json
"files": ["dist", "bin"]
```

`package.json`, `readme.md`, `LICENSE` and the `main` file are included regardless; `CHANGELOG.md`
is a deliberate yes or no rather than something to inherit. Worth doing before the restructure
rather than inside it: it is a one line change that reviews on its own, and afterwards half the
current denylist entries are no longer siblings of the package, so the file becomes misleading as
well as leaky.

## Two test runners, on purpose

The CLI runs `node --test` over `.mjs` files importing from `dist/`; the extension runs vitest.
They stay separate. Unifying them rewrites nearly 300 passing tests for no behavioural gain, and
`AGENTS.md` says not to introduce a test framework. The root `npm test` fans out across workspaces.
This is a decision, not an oversight — please do not tidy it.

CI does not run either today. `test-build.yml` runs on pull requests but only builds. PR B adds
`npm test` there, for both packages.

`npm test` also deletes a tracked file, `temp/doctor-mermaid-1222fd6d86-eb8f4253.svg`, because the
tests clean `./temp`. The file should be untracked and `temp/` added to `.gitignore`.

## TypeScript 7

`typescript@latest` on npm is now 7 (the native compiler). TS 6 only lives on as
`@typescript/typescript6`, for tools that still need the JavaScript API. The extension already
compiles on 7: it declares `"@typescript/native": "npm:typescript@^7.0.2"`, which provides its `tsc`,
and keeps `"typescript": "npm:@typescript/typescript6@^6.0.2"` only because typescript-eslint
imports `typescript`.

Doctor moves from 5.9.3 to 7 with the same alias, pinned exactly
(`"@typescript/native": "npm:typescript@7.0.2"`), so both packages share one compiler and the build
keeps calling `tsc`. `tsc-alias` has no dependency on `typescript`, so it doesn't care which version
gets hoisted. Watch mode (`tsc -w`) works on 7.

Tested on 2026-11-02 with the extension's compiler: doctor builds on TS 7, `tsc-alias` resolves every
alias, `doctor version` runs, and all 398 tests pass. The emitted JS differs from 5.9.3 in 8 files,
and only in where the temporary variables of the `?.`/`??` downlevel are declared. TS 6 works too,
with the same `tsconfig.json` changes:

- drop `baseUrl` (deprecated in 6, gone in 7) and write the paths as `./src/...`
- set `rootDir: "./src"`, or it refuses to emit
- set `strict: false` explicitly next to `strictNullChecks`. `strict` is on by default since 6, which
  gives five errors (implicit `any`s and a markdown-it plugin type). Turning it on is separate work.
- set `"types": ["node"]` and declare `@types/node`, which doctor only gets by accident today (26.1.2,
  through another dependency). Without `types`, doctor's compile would also load the extension's
  hoisted `@types/react` and `@types/vscode`.

## Sequencing

1. ~~**Merge #209 first.**~~ Done (`714781f6`).
2. **The `files` allowlist**, on its own, small.
3. **TypeScript 7 for doctor**, on its own, small: the alias and the `tsconfig` changes above. Doing it before the move keeps PR A free of compiler changes.
4. **PR A — the mechanical move, no behaviour change.** One commit per step so a bisect can find a
   break: `git mv` the CLI into `apps/doctor` and fix its aliases and scripts; workspaces at the
   root; CI paths; husky; `AGENTS.md`/`CLAUDE.md`. Green at every step. The only review question is
   whether anything broke.
5. **PR B — drop the extension in**, with `.vscodeignore`, a `publisher`, the packaging fixes above,
   the schema import instead of the copy, per-package release tags, `paths` filters on the publish
   workflows, `npm test` in `test-build.yml`, and a `vsce` workflow.
6. **PR C onward — the redundancy work**, starting with `packages/common`. The `homepage` key the
   extension misses is the first thing it should carry.

A and B stay apart deliberately: A is a large diff that has to be boring, B is a small diff that
needs real review.

## Not in scope

Preserving the extension's git history. It comes over as a clean copy by decision; the original
repository keeps its own history.
