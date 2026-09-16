# Plan: check what the account may do before publishing anything

Status: draft / not started
Author: proposed via AI coding agent session, for @estruyf to review
Related: raised after a publish died at the navigation step, having already written 138 pages

## Problem

`doctor` finds out what its account is allowed to do by trying it, one operation at a time, in the
middle of a run. A permission it lacks surfaces as a failure from whichever command happened to need
it first, at whatever point in the pipeline that is:

- `spo navigation node remove` → `Access is denied. (Exception from HRESULT: 0x80070005
  (E_ACCESSDENIED))` — after every page had already been published
- `spo listitem set --systemUpdate` → `Attempted to perform an unauthorized SystemUpdate operation`
- `spo theme apply` / the site logo → handled, but only because somebody hit it before

Each of these has been patched where it was found, and each fix looks different: one degrades to a
lesser API, one warns and skips a column, one warns and skips the whole step. A run can still get
most of the way through its work before discovering it cannot finish, and the author has no way to
know in advance which parts of their `doctor.json` this account can actually deliver.

## Goal

Ask the site what this account may do **before writing anything**, report it as a capability list,
and run only the steps that are possible — reporting the ones that are not, rather than failing on
them later.

## Design

### 1. Where it goes

The `publish` pipeline already opens with a **pre-check** task ([PrecheckHelper](../../src/helpers/PrecheckHelper.ts)),
which validates the local files and slug collisions before any SharePoint call. The capability probe
belongs in the same task, after the local checks and before anything is written — and equally in
`doctor status`, which should be able to report what a publish *would* be able to do.

### 2. What to probe, and how cheaply

Everything here is a read, or a write to something doctor owns. Nothing probes by mutating a page.

| Capability | Probe | Needed for |
| --- | --- | --- |
| Read the site | `GET _api/web?$select=Title` | everything |
| Read Site Pages | `GET _api/web/GetList('…/SitePages')?$select=Id` | everything |
| Create and write pages | list `EffectiveBasePermissions` on Site Pages (`AddListItems`, `EditListItems`) | the whole publish |
| System update | `ManagePersonalViews`/`ManageLists` on Site Pages, or the first refusal | descriptions without touching history |
| Set `Author` | `ManageLists` on Site Pages | the `author` front matter |
| Manage navigation | `EffectiveBasePermissions` on the web (`ManageWeb`) | `menu`, `cleanQuickLaunch`, `cleanTopNavigation` |
| Apply theme / chrome / logo | `ManageWeb` on the web | `siteDesign` |
| Read the term store | `GET _api/v2.1/termStore/sets/<id>?$select=id` for one configured set | taxonomy columns |
| Read site users | `GET _api/web/siteusers?$top=1` | the `author` front matter |
| Write the asset library | `EffectiveBasePermissions` on `--library` | images, and the publish state |

`_api/web/EffectiveBasePermissions` and the per-list equivalent answer most of this in two calls,
without trial writes. The term store and site users are single cheap reads. The whole probe should be
a handful of requests, run once.

### 3. Only run what is possible

The probe's result is a capability set threaded into the options, and the `publish` task list already
gates each step with an `enabled:` predicate — so most of this is extending those predicates:

- **no page write** → stop before writing anything, with an error naming the permission. This is the
  one capability whose absence is fatal, because it is the whole job.
- **no navigation rights** → skip the navigation task, report once.
- **no `ManageWeb`** → skip the site design task, report once.
- **no system update** → keep today's fallback, but say so at the start rather than on first use.
- **no term store read** → report it, and let the pages whose front matter needs a term be skipped by
  the existing per-page metadata handling rather than failing.
- **no site users read** → same, for `author`.

Reporting is one block at the start of the run, listing what will be done and what will be skipped
and why — and it belongs in the `--output json` document too, so a pipeline can gate on it.

### 4. What this does not replace

A probe says what the account *may* do, not what the site will accept. A term that is not in the set,
an author who is not a member of this site, a column that does not exist — those are still per-page
problems and stay where they are. The capability check is about the operations, not the values.

Nor should it be trusted as the only guard: SharePoint can still refuse a call the permissions
suggested would work, so the existing `isPermissionError` handling stays. The probe changes *when*
the author finds out, not whether the code copes.

### 5. Skipping the probe

Some accounts will not be allowed to read `EffectiveBasePermissions` either. A probe that cannot run
must not stop the publish: it reports that it could not determine the capabilities and the run
proceeds exactly as it does today. `--skipPrecheck` should also skip it, as it does the local checks.

## Scope check against `AGENTS.md`

- A new helper owning the probe and the capability set, exported from `src/helpers/index.ts`, with a
  `reset()` in `Commands.resetRuntimeState()`.
- `PrecheckHelper` — call it, and report.
- `publish.ts` — extend the `enabled:` predicates; `status.ts` — report the same capabilities.
- `src/models/` — the capability set, and its place in the publish/status JSON output.
- `OutputHelper` — the report block; `PublishOutput`/`CommandResult` — the JSON shape.
- `docs/.../configuration/cli-options/` — what the pre-check now covers, and the JSON output.
- `changelog.json`.
- `tests/` — the probe's *interpretation* is pure and testable: given an `EffectiveBasePermissions`
  response, which capabilities are present; given a capability set, which tasks are enabled; a probe
  that fails leaves everything enabled.

## Open questions for @estruyf

1. **Is a missing capability ever fatal?** Proposed: only the page write. Everything else reports and
   is skipped, which matches how `doctor` now treats metadata it cannot resolve.
2. **Should `status` run the probe too?** It would let someone check a new app registration without
   publishing, which seems worth the extra calls.
3. **`EffectiveBasePermissions` vs. trying it.** The permission masks are authoritative but fiddly to
   read, and the CLI has no command for them, so this is more direct REST. The alternative — a probe
   that attempts a harmless write and undoes it — is simpler to reason about but writes to the site.
   Proposed: permission masks, no trial writes.
4. Is it worth a `--skipCapabilityCheck` of its own, or is `--skipPrecheck` enough?

## Change History

| Date | Change |
|---|---|
| 2026-09-16 | Initial draft, after a publish failed at the navigation step with every page already written. |
