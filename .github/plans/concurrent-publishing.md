# Plan: concurrent page publishing, and surviving SharePoint throttling

Status: draft / not started
Author: proposed via AI coding agent session, for @estruyf to review
Related: raised while looking at publish runtime — pages are processed strictly one at a time

## Problem

`DoctorTranspiler.processFiles()` walks the changed pages in a plain `for` loop with `await`
([DoctorTranspiler.ts:96](../../src/helpers/DoctorTranspiler.ts)). Each changed page costs roughly
eight to ten round trips:

| Call | Count |
| --- | --- |
| `spo page get` / `spo page add` (create if missing) | 1 |
| REST page GET, and `checkoutpage` when it is not checked out | 1–2 |
| REST `SavePageAsDraft` (the canvas) | 1 |
| `spo page header set` | 1 |
| `spo page get` for the list item id | 1, cached per page afterwards |
| `spo listitem set` (metadata) | 1, when the page has metadata |
| publish | 1–2 |
| `spo listitem set` (description) | 1 |
| `_api/web/siteusers` (author) | 1, when the page sets one |

Everything else is already cached for the whole run: the field schema, the term sets, the web part
definitions, the Site Pages list, and the access token. So the remaining cost is latency, paid
serially: a 150 page site is on the order of 1500 sequential round trips, and the CPU is idle for
nearly all of it.

Running pages concurrently is the only lever with a real effect — sub-hashing the header or the
metadata to skip a call or two saves 10–20% on changed pages and nothing anywhere else.

## Why this is not `Promise.all`

**SharePoint throttles, and concurrency is what makes it throttle.** Above a request rate SharePoint
answers `429 Too Many Requests` (or `503`) with a `Retry-After` header saying how long to wait.
Multiplying the request rate by the pool size is precisely the thing that triggers it, so the
throttling story has to be built **first**, and is worth having on its own even at a concurrency of
one.

Today there is no throttling story at all:

- `executeWithRetry()` ([RunCommand.ts](../../src/helpers/RunCommand.ts)) retries **once**, after a
  fixed 5 seconds, only when `--retryWhenFailed` is set, and treats every failure the same. It never
  looks at `Retry-After`, and a 429 is retried exactly as a 404 is.
- `ApiHelper` has **no retry at all**. The canvas read and write, the term store walk and the site
  user lookup all go straight through `fetch`, so a single 429 fails the page.

## Design

### 1. Throttling, as a prerequisite

**Honour `Retry-After`.** On `429` and `503`, wait what the response asks for (it comes as seconds or
as an HTTP date) rather than a guess. Fall back to exponential backoff with jitter when the header is
absent. Cap the attempts and fail with a message that says the page was throttled, not that it
"failed".

**One shared gate per site, not one timer per worker.** This is the part that decides whether
concurrency is usable. If every worker backs off on its own, all of them wake at roughly the same
moment, fire together, and are throttled again — the pool converges into a thundering herd and the
run is slower than it was sequentially. Instead:

- a single "not before" timestamp per site, shared by every worker;
- a worker that is throttled pushes that timestamp out and stops; every other worker checks it before
  its next call and waits too, so the whole pool backs off together on the first 429 rather than each
  discovering it in turn;
- when the gate opens, release the workers with a small random stagger so they do not all fire on the
  same millisecond.

**Where it lives.** `executeWithRetry()` is the documented choke point for CLI calls and stays that
way. `ApiHelper` needs the same treatment; the cleanest shape is one small module owning the gate and
the backoff, used by both, so a CLI call and a REST call cannot each hold their own idea of when the
site is available.

**A wrinkle worth checking early:** for `m365`/`localm365` the CLI runs in-process through
`executeCommand()`, so doctor sees a thrown error, not an HTTP response — the status code and
`Retry-After` have to be recovered from the error text, and it is worth confirming the CLI does not
already swallow them. If it does, the CLI calls can only fall back to blind backoff while the REST
calls use the real header, which is an argument for moving more calls to `ApiHelper` over time.

### 2. The worker pool

- A `--concurrency` option, default **1**, which is exactly today's behaviour and keeps the change
  opt-in.
- A pool over `filesToProcess`, with each page still wrapped in the existing per-page try/catch so
  `--continueOnError` keeps working unchanged.
- The pool size is an upper bound, not a target: the throttle gate can idle the whole pool.

### 3. Shared state to check first

Node is single threaded, so nothing here corrupts — the risk is **interleaved `await`s doing the same
work several times**, or a flag being read before it is set:

- `PagesHelper.processedPages` — slug → list item id. Concurrent misses each issue their own
  `spo page get`. Store the in-flight promise rather than the resolved value.
- `PagesHelper.listFieldMap`, `CanvasHelper.definitions`, `TermsHelper.terms`, `AccessToken.cache` —
  read-mostly, populated once. Same fix: cache the promise, not the result. Wasteful rather than
  wrong, but `TermsHelper` walks a whole term set, so duplicating it is expensive.
- `PagesHelper.systemUpdateRefused` — set when a system update is first refused. With a pool, N pages
  can all attempt and fail it before any of them sets the flag. Harmless, but it re-introduces the
  per-page cost the flag exists to avoid.
- `StatusHelper` counters and `StateHelper.markPublished` — plain increments and object writes, safe.
  The order of entries in `.doctor/state.json` becomes non-deterministic; sort on save if a stable
  diff matters.
- `TempDataHelper` — scratch files under `./temp`. Confirm the names cannot collide between pages.
- `MermaidHelper`'s rendered-diagram cache — same in-flight concern, and rendering is expensive.

### 4. Progress output

`task.output` is a single listr2 line, and `[3/144] Processing x` stops meaning anything when eight
pages are in flight. Report completed-of-total plus how many are running, and keep the per-page
timings (`StatusHelper.addPageDuration`) which stay correct either way.

### 5. What stays sequential

- **Navigation, the site design and the state save** already run as later tasks in the `publish` list,
  after every page — untouched.
- **Translations** are processed in their own step after the normal pages, because SharePoint can only
  create a translation once its source page exists. If that step is ever made concurrent, a
  translation must not run alongside its own source page.
- The **pre-check** is local and already fast.

## Scope check against `AGENTS.md`

- `OptionsHelper.getArgs()` + `parseArguments()` + `CommandArguments` — the `--concurrency` option, in
  all three places.
- `schema/<current>.json` and the `doctor-json` docs page — it is a `doctor.json` option too.
- A new helper for the throttle gate and backoff, exported from `src/helpers/index.ts`, with a
  `reset()` in `Commands.resetRuntimeState()` since it holds per-site state.
- `RunCommand.ts` and `ApiHelper.ts` — both routed through it.
- `DoctorTranspiler.processFiles()` — the pool.
- `docs/.../configuration/cli-options/` — the new option, and a note on what throttling does to a run.
- `changelog.json`.
- `tests/` — the gate is pure enough to test with a fake clock: `Retry-After` in both formats, the
  shared back-off (a second worker waits without issuing a call), the stagger on release, the attempt
  cap. The pool itself is testable with a stub page processor: concurrency is respected, an error in
  one page does not stop the others, and `--continueOnError` still decides whether the run fails.

## Open questions for @estruyf

1. **Default concurrency.** Ship as `1` (no behaviour change, opt in) or pick a modest default like
   `4`? A default above 1 changes the shape of every existing user's run on upgrade.
2. **Is throttle handling always on, or tied to `--retryWhenFailed`?** Honouring `Retry-After` is
   arguably not a "retry" but correct behaviour — but turning it on unconditionally changes what a
   failing run does today, since a throttled page currently fails fast.
3. **Gate scope.** One gate per site URL is the obvious unit. Doctor only publishes to one site per
   run, so a single global gate would do — worth confirming nothing plans to change that.
4. Is there an appetite for moving more of the page calls off the CLI and onto `ApiHelper`, which is
   the only path where the real `Retry-After` is visible?

## Change History

| Date | Change |
|---|---|
| 2026-09-15 | Initial draft. Written after measuring the per-page call budget and confirming that neither `executeWithRetry` nor `ApiHelper` handles 429 or `Retry-After` today. |
