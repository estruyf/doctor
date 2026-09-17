# Plan: one repository for the CLI and the metadata extension

Status: agreed in principle, not started
Context: @estruyf asked for the **Doctor Metadata** VS Code extension
([involv-intranet/sharepoint-front-matter-vscode](https://github.com/involv-intranet/sharepoint-front-matter-vscode))
to be merged into this repository. The code comes over as a clean copy; its history stays in the
original repo.
Related: the metadata, `author` and page template work in 2.3.0 is what the extension exists to
drive — see [control-shortcodes.md](control-shortcodes.md) for the other half of that release.

## Why

The extension writes the front matter `doctor` reads. That contract currently lives in two places:

- this repository, in the front matter parsing and the `metadata` transforms;
- the extension, in a hand-maintained `src/utils/doctorMappings.ts` — 133 lines naming every
  front matter key, its SharePoint internal name, its fallback type and how a person field is
  resolved.

Nothing keeps them in step, and the drift has already started: that file's own header cites
`doctor-tools/doctor`, which is not where this project lives. A change to the contract on one side
is invisible to the other until somebody publishes a page and reads the result.

That is the same failure this release spent its review passes on — `status` and `publish` each
computing "has this page changed" separately until one quietly stopped matching the other. The fix
there was one entry point both call. The fix here is the same shape, and it needs one repository
before it can be written.

Shared documentation is the second reason. The extension is unusable without a valid `doctor.json`,
so its pages belong downstream of the configuration pages rather than in a site of their own.

## Structure

```
package.json              private workspace root, no code of its own
docs/                     stays put — the site serves both packages
schema/                   stays put — see below, this is a published URL
assets/                   repository-level images
.github/ .husky/          repository-wide
packages/
  doctor/                 @estruyf/doctor — src, bin, dist, tests, scripts
  vscode-extension/       doctor-metadata
  front-matter/           later — the shared contract
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
at that path, and moving it buys nothing. It gets listed as a workspace and gains a sidebar group
for the extension, downstream of the configuration pages.

`schema/` **must not move**, and this is the one hard constraint in the whole plan. The schema is
addressed by URL:

```
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

### Two shared contracts, kept apart

| | Describes | How it is shared |
| --- | --- | --- |
| `schema/*.json` | the shape of `doctor.json` | stays at the root; already published over HTTP |
| `packages/front-matter` | the shape of page **front matter** | new package, imported by both |

They are not the same thing and should not become one package. The first is configuration consumed
by editors over HTTP; the second is the page contract consumed as code.

## What the move breaks

| | |
| --- | --- |
| `.github/workflows/*.yml` (4) | none use `working-directory` today — all assume the root |
| `.husky/pre-commit` | runs `node ./scripts/prepare-changelog.js`, root relative |
| npm publish | the `#release` flow needs `-w @estruyf/doctor` |
| a local `npm link` | re-run from the package directory |
| `tsconfig` + `tsc-alias` | the `@helpers`/`@models` aliases are package relative |
| `AGENTS.md` / `CLAUDE.md` | the command table and every path in it |

## Packaging the extension

`vsce` is the Visual Studio Marketplace tool: `vsce package` builds a `.vsix` (a zip plus manifest),
`vsce publish` uploads it. Two things to settle while moving it, both of which are broken today
rather than broken by the move:

- **There is no `publisher` field**, so `vsce package` cannot succeed as the extension stands. It
  becomes part of the extension's permanent Marketplace id (`publisher.doctor-metadata`), so it is
  worth agreeing before the first publish rather than after.
- **There is no `.vscodeignore`**, so the `.vsix` ships `src/`, `test/` and `tsconfig.json`.

`vsce` is also the one tool that dislikes workspaces: it walks the extension's own `node_modules` to
decide what to ship, and workspaces hoist those to the root. The extension already bundles its six
runtime dependencies into `dist/extension.js` with esbuild, so `vsce package --no-dependencies` is
the answer — the bundle is self contained and there is nothing for it to go looking for.

## Do the publish allowlist first, separately

`.npmignore` denies `src`, `docs`, `schema`, `scripts` and more — and has never mentioned `tests`.
`npm pack --dry-run` on 2.3.0:

| | |
| --- | --- |
| `dist/` | 300 files, correct |
| `tests/` | **28 files, shipped to every consumer** |
| `bin/` | 2 files, correct |
| `AGENTS.md`, `CLAUDE.md` | AI tooling instructions, shipped |
| `cypress.sample.json`, `.templates/` | strays |

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

## Sequencing

1. **Merge #209 first.** 69 files across 79 commits; rebasing that over a rename of the whole tree
   is not worth anybody's afternoon.
2. **The `files` allowlist**, on its own, small.
3. **PR A — the mechanical move, no behaviour change.** One commit per step so a bisect can find a
   break: `git mv` the CLI into `packages/doctor` and fix its aliases and scripts; workspaces at the
   root; CI paths; husky; `AGENTS.md`/`CLAUDE.md`. Green at every step. The only review question is
   whether anything broke.
4. **PR B — drop the extension in**, with `.vscodeignore`, a `publisher`, and a `vsce` workflow.
5. **PR C onward — the redundancy work**, starting with `packages/front-matter`.

A and B stay apart deliberately: A is a large diff that has to be boring, B is a small diff that
needs real review.

## Not in scope

Preserving the extension's git history. It comes over as a clean copy by decision; the original
repository keeps its own history.
