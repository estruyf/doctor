# Plan: control shortcodes — splitting a page into multiple web parts

Status: **implemented** on `feat/sharepoint-metadata-transforms` (2026-09-15). The design below is
what was built; see [As built](#as-built) for the decisions taken during implementation and where
the result differs from this plan.
Author: proposed via AI coding agent session, for @estruyf to review
Related: enables a real implementation of a "related pages" search web part, currently only a
documented placeholder shortcode (`<related-pages />`) in a consumer repo

## Problem

Today a published page always ends up as **exactly one** SharePoint control: the built-in
Markdown/Text web part (`webPartId: 1ef5ed11-ce7b-44be-bc5e-4abd55101d16`), created or updated by
a single call to `PagesHelper.insertOrCreateControl()` from `DoctorTranspiler.ts`. Every shortcode
today — `callout`, `icon`, `mermaid`, `toc`, and any custom one — returns HTML that gets spliced
back into that one Markdown blob (`ShortcodesHelpers.parseBefore`/`parseAfter`, `shortcode.render()`
always returns a string).

This means there is no way for a shortcode to say "insert an actual separate SharePoint web part
here" — e.g. a search-driven "related pages" web part, a `List` web part, a `Hero`, or a custom
SPFx `ClientWebPart`. Anything that isn't renderable as static HTML inside the Markdown web part is
out of reach for shortcode authors.

## Goal

Let a shortcode declare that it should become its **own web part control**, splitting the page's
canvas into: `[markdown segment] [other control] [markdown segment] ...`, driven purely by where
the shortcode tag appears in the source Markdown. No change for existing shortcodes or pages that
don't use one — this is fully additive.

## Design

### 1. New shortcode kind: `"control"` (default stays `"inline"`)

A shortcode module gains an optional `kind` field. Existing modules (no `kind` field) keep working
unchanged:

```javascript
// existing behaviour, unchanged — kind defaults to "inline"
export default {
  name: "callout",
  render: (attributes, html) => `<div class="callout">${html}</div>`,
};
```

```javascript
// new: a control shortcode contributes a separate SharePoint control instead of HTML
export default {
  name: "related-pages",
  kind: "control",
  render: (attributes, ctx) => ({
    // one of:
    standardWebPart: undefined,      // e.g. "List" for an OOTB web part
    webPartId: "<guid>",             // custom/SPFx ClientWebPart id
    webPartProperties: { /* ... */ }, // JSON passed to --webPartProperties
  }),
};
```

`ctx` gives the shortcode access to page-level facts it may need for its properties (front matter,
slug, site URL) without every shortcode author having to re-derive them.

`kind: "control"` shortcodes must be **kept out of the inline shortcode registry entirely** — the
constraint is not a `beforeMarkdown` position. Segmentation (§2) runs on raw Markdown *before*
`getHtmlData()`, so a control tag never reaches either parse phase and `beforeMarkdown` is
meaningless for it. What matters is that `ShortcodesHelpers.parse()` must never receive a control
tag in its `tags` list: if it did, any occurrence that survived segmentation (nested in a list item,
a blockquote, a table cell — §2 only finds *top-level* occurrences) would be picked up by
`parseAfter`, `render()` would return an object, and `$elm.replaceWith(<object>)` would write
`[object Object]` into the published page. A control tag found below top level must therefore fail
loudly, in the style of the existing "Missing render function" check.

Two prerequisites in the current code:

- `ShortcodesHelpers.init()` copies only `{ render, beforeMarkdown }` off each loaded module
  (`ShortcodesHelpers.ts:51-54`), so `kind` is dropped on load today — that line has to change or
  the feature is inert no matter what else is built.
- `ShortcodeRender` in `src/models/Shortcode.ts` has no `kind` field, and its `render` signature is
  typed as returning `Promise<string> | string`. Both need widening, and an unrecognised `kind`
  value must throw rather than silently falling back to `"inline"`.

### 2. Segmenting the page before HTML conversion

Add a segmentation pass in `MarkdownHelper` (or a new `SegmentsHelper`, consistent with the existing
one-helper-per-concern pattern) that runs on the raw Markdown, before `getHtmlData()`:

1. Mask fenced/inline code the same way `ShortcodesHelpers.maskCode()` already does, so a
   control-shortcode tag shown as a code sample isn't mistaken for a real one.
2. Find top-level occurrences of any registered `kind: "control"` tag (cheerio, `xmlMode: true`,
   same approach `ShortcodesHelpers.parse()` uses).
3. Cut the document into an ordered list of segments:
   ```typescript
   type PageSegment =
     | { type: "markdown"; content: string }
     | { type: "control"; shortcode: string; attributes: Record<string, string> };
   ```
   A page with no control shortcode produces exactly one `{ type: "markdown", content: <whole file> }`
   segment — byte-for-byte the same input `getHtmlData()` gets today, so existing pages are
   unaffected.
4. Each `"markdown"` segment goes through the **existing** pipeline unchanged (`getHtmlData()` →
   `markdown-it` → inline shortcodes → HTML). `"control"` segments call the shortcode's `render()`
   to get its `standardWebPart`/`webPartId`/`webPartProperties`, nothing else.
5. A control-shortcode tag found *below* top level — inside a list item, blockquote or table cell,
   or pulled in mid-paragraph by a partial — is an error, never a silent inline render (see §1).

Segmentation should be a **pure, exported function** (`markdown + registered control tags →
PageSegment[]`). It is the only part of this feature testable without a SharePoint tenant, and per
`AGENTS.md` anything it caches needs a `reset()` wired into `Commands.resetRuntimeState()`.

### 3. Publishing: one control per segment, in order

`PagesHelper.insertOrCreateControl()` (singular, one call per page today) becomes a loop driven by
the segment list, replacing the single call in `DoctorTranspiler.ts` around line 608:

- Markdown segments: same `spo page clientsidewebpart add` / `page control set` as today, but with
  a per-segment title (`webPartTitle` for the first, `${webPartTitle} (2)`, `${webPartTitle} (3)`, …
  — needs to stay stable across runs so re-publishing updates in place rather than duplicating).
- Canvas order comes from the segment list, but see the two caveats below — `--order` alone does not
  express it.
- Control segments: `spo page clientsidewebpart add` with either `--standardWebPart <type>` (OOTB,
  validated against `StandardWebPartUtils.isValidStandardWebPartType`) or `--webPartId <guid>
  --webPartProperties <json>` (custom/SPFx).
- Single-segment pages (the overwhelming majority, at least initially) take the exact code path used
  today — this should be structured as "loop of 1" rather than a parallel special case, so there is
  only one implementation to maintain.

**`--order` is an insert position, not an absolute index.** In `page-clientsidewebpart-add.js` the
value indexes into the controls that already exist *in the same zone/column*, and `controlIndex` is
renormalised across the column afterwards. "`--order` equal to the segment index" therefore only
holds while adding strictly ascending onto a page doctor fully owns. On a re-publish where only
segment 3 is new, `--order 3` means "before the 3rd existing control" — the wrong slot as soon as
the page also carries controls doctor did not create.

**Reordering an existing control is not possible through the CLI.** `spo page control set` accepts
only `id`, `pageName`, `webUrl`, `webPartData`, `webPartProperties` — there is no move operation.
If a `<related-pages />` moves from position 2 to position 4 in the source, reconcile has to remove
and re-add it (new instance ids each run) or PATCH `CanvasContent1` directly.

**Decided: compose `CanvasContent1` and write it once, rather than looping CLI calls.** A page cost
1 CLI call before this; with N segments plus reconcile it would have become 2N+ calls, each a full
page checkout/save under the 120s `CliCommand.getTimeout()` and its single 5s retry. `spo page
control remove` additionally calls `SavePageAsDraft` and then **republishes** unless `--draft` is
passed, which fights `draft: true` front matter. And neither of the two caveats above has a fix on
the CLI path at all.

So the canvas is read, composed in full and written back with one `SavePageAsDraft`, through
`ApiHelper` — the same route doctor already uses where the CLI falls short. This replaces the
add/set path for *every* page, not only the split ones, so there is one implementation rather than
two. Publishing stays where it was, in `PagesHelper.publishPageIfNeeded`, so a draft page is still
left as a draft.

### 4. Reconciling controls across runs (idempotency)

Today's match is "find the one control whose `webPartData.title === webPartTitle`". With N
controls per page this needs to become:

- Match existing controls by the same title scheme (`webPartTitle`, `${webPartTitle} (2)`, …) for
  markdown segments.
- Match existing control-shortcode controls by a marker kept in **`.doctor/state.json`**, not on the
  control itself. `serverProcessedContent.searchablePlainTexts.code` is *not* a hidden field — it is
  the Markdown web part's actual source content (`MarkdownHelper.ts:169-175`), which is what
  SharePoint shows in the page editor, so writing a marker there corrupts page content. And for a
  control segment the web part belongs to SharePoint or to an SPFx author; doctor cannot safely
  inject arbitrary `serverProcessedContent` into someone else's web part schema. `StateHelper`
  already keys by slug, so a `segment → control instanceId` map belongs there, with the title match
  as the fallback when `--disableStatePersistence` is set. This is also what keeps a control the
  page owner added manually on the SharePoint side from ever being touched.
- Reconcile: `page control set` for controls that still match a current segment, `page
  clientsidewebpart add` for new segments, and `spo page control remove --force` for controls whose
  segment disappeared (the tag was deleted from the Markdown, or the page went from 3 segments to
  1). **The remove path is entirely new code with no precedent in this repo** — `grep` finds no
  control removal anywhere in `src/`, and `--removeDeleted` recycles whole *pages*
  (`spo page remove --recycle`, `PagesHelper.ts:152`), not controls. There is no existing
  confirm/force pattern to copy, and this is the only destructive operation in the feature, so it
  needs gating at least as careful as `--removeDeleted`'s.

**Title-scheme fragility scales with N.** If `--webPartTitle` changes between runs, every title
match fails and the page duplicates its controls. That is a one-control annoyance today; with N
segments it is an N-control mess, and the new remove path makes the blast radius destructive rather
than merely untidy. The state-file marker above is what bounds this.

### 5. State hash / `doctor status`

`StateHelper` hashes "front matter + content + partials" per slug — a control shortcode's
attributes are part of that same Markdown content, so the existing hash already invalidates
correctly when a control shortcode's attributes change. No new hashing logic should be needed here,
but this needs to be verified with a test once implemented, since the segmentation pass reads from
the same resolved source string the hash is computed from.

Verified against the code: the hash is computed at `DoctorTranspiler.ts:454` from the resolved
source, *before* rendering — so segmentation does read exactly the string the hash covers.

### 6. Consequences of cutting one Markdown document into pieces

Each markdown segment runs `getHtmlData()` independently. That is not free, and it is the largest
unaddressed risk in this plan:

- **Duplicated CSS.** `getHtmlData()` appends the full minified hljs theme plus the shortcodes and
  extended `<style>` block to whatever it renders (`MarkdownHelper.ts:141-146`). N segments means N
  copies of that CSS in the page payload. It has to be emitted once — on the first segment only, or
  hoisted out of `getHtmlData()`.
- **`<toc />` breaks.** markdown-it runs per segment, so a table of contents in segment 1 only sees
  the headings in segment 1. The left/right post-processing in `ShortcodesHelpers.parse()` also
  targets `.doctor__container`, which now exists once per segment. For v1, `toc` together with a
  control shortcode is probably a hard incompatibility and should error rather than render wrongly.
- **Anchor slugs, footnotes and reference links.** markdown-it-anchor de-duplicates slugs per
  render, so two `## Overview` headings in different segments both become `#overview`. Footnote
  numbering restarts per segment, and reference-style link definitions collected at the bottom of a
  file stop resolving for the segments above them.

At minimum these ship as documented limits; better, segmentation refuses to split a document that
uses the affected features.

### 7. Interactions with existing features

- **`markdown.allowHtml` gates the whole feature.** `ShortcodesHelpers.init()` only runs when
  `allowHtml` is true (`main.ts:50-56`); without it the registry holds only the built-ins and a
  control-shortcode tag ends up as a literal string in the published page. That is a convenient
  safety property, but it has to fail loudly rather than silently no-op.
- **Multilingual.** For `*.machinetranslated.md`, `markup.content` is already HTML by the time it
  reaches the publish call (`wasAlreadyParsed`, `DoctorTranspiler.ts:454-461`), so a segmentation
  pass that assumes raw Markdown does not apply. Either segment before translation, or explicitly
  reject control shortcodes on machine-translated pages.

## Scope check against `AGENTS.md`

This is a real feature, not a one-file patch. Per "Definition of done", the following move together
in the same change:

- `src/models/Shortcode.ts` (or wherever the `Shortcode` type lives) — add `kind` and the
  `ControlShortcodeResult` return shape.
- `src/helpers/ShortcodesHelpers.ts` — carry `kind` through `init()` (it is dropped today), keep
  control tags out of the `tags` list `parse()` walks, and expose a way to ask "is this tag a
  control shortcode".
- `src/helpers/MarkdownHelper.ts` (or new `SegmentsHelper.ts`, exported from `src/helpers/index.ts`)
  — the segmentation pass.
- `src/helpers/PagesHelper.ts` — loop + reconcile instead of single insert/update.
- `src/helpers/StateHelper.ts` — the per-slug `segment → control instanceId` map from §4.
- `src/helpers/DoctorTranspiler.ts` — call the new loop instead of the single
  `insertOrCreateControl()` call.
- `docs/src/content/docs/docs/content/shortcodes/index.md` — document the `kind` field and the
  control-shortcode contract, with a sidebar entry per "new shortcode" in the definition-of-done
  table.
- `schema/<current>.json` — only if this introduces a new `doctor.json` setting. It does not, and
  `schema/2.1.0.json` already covers every option the code reads, so no new schema file was added.
  Its `$id` pointed at `2.0.0.json`, which was corrected.
- `changelog.json` — new entry.
- `tests/` — tests import compiled helpers from `dist/` with no SharePoint available, so the
  testable surface is segmentation plus reconcile planning (given a segment list and a prior state,
  which adds/sets/removes are emitted — without executing them). At minimum: a page with zero
  control shortcodes still produces one segment/one control (regression guard), a page with one
  control shortcode produces three segments in the right order, a control tag below top level
  throws, and a re-publish plans an update in place rather than a duplicate.

## Decisions (was: open questions for @estruyf)

All three were decided as proposed and built that way. @estruyf can still overrule any of them; the
first two are the ones with a cost to reversing.

1. **Should `kind: "control"` be opt-in per `doctor.json`?** — Decided: **no flag.**
   `markdown.allowHtml` already gates the entire shortcode system (§7), and using the feature
   requires authoring a module with `kind: "control"`, so it is safe by construction. A flag would
   add a fourth place to keep in sync (args → `doctor.json` → `CommandArguments` → schema) for no
   real safety gain. Instead, validate that an unrecognised `kind` throws (§1).
2. **Multi-column pages** — Decided: **same section/column for v1.** Every control doctor writes
   lands in section 1, column 1, as before. `CanvasHelper.compose()` already takes a `section` and
   `column`, so a `column=`/`section=` attribute on the tag is an additive change later; what it
   would still need is creating sections during publish and reconciling across them. Deferred.
3. **Is there an existing "this control belongs to doctor" mechanism to reuse?** — Answered: **no.**
   The title match was all there was; the translation pipeline tags nothing. `StateHelper` now
   records the instance ids per slug, per the revised §4.

## As built

What shipped, and where it departs from the plan above.

**The publish path was rewritten, not extended.** `PagesHelper.insertOrCreateControl()` is gone,
replaced by `applySegments()`. `getPageControls()` and `MarkdownHelper.getJsonData()` were its only
callers and went with it. Every page — including the single-segment majority — now goes through
`CanvasHelper`: read and check out the page, compose the whole canvas, one `SavePageAsDraft`.

**Three combinations are refused rather than published wrong.** Each was a "document it as a known
limit" in §6/§7; on reflection a page that publishes incorrectly is worse than one that fails:

- `<toc />` together with a control shortcode. Each segment is rendered on its own, so the table of
  contents could only ever list the headings beside it.
- A control shortcode on a machine translated page, which reaches publish as HTML.
- A control shortcode with `--disableStatePersistence`. The state file is the only record of which
  web parts are doctor's, so without it a re-publish would add a second copy on every run.

**The stylesheet is emitted once.** `getHtmlData()` takes an `includeStyles` argument, and only the
first markdown segment carries the hljs and shortcode CSS (§6).

**Where a control tag may sit is stricter than "top level".** It has to be alone on an unindented
line with no body. Anything else — mid-paragraph, in a list item, a blockquote, indented, or
wrapped around content — throws. A control shortcode has no body to render, so there was nothing to
gain from being lenient.

**Ownership is by recorded instance id, with `--webPartTitle` as the fallback.** `StateHelper`
stores the ids per slug (`controls`), and `markPublished()` carries them across. Without state,
doctor recognises only its own markdown controls, by `webPartTitle` and the numbered
`webPartTitle (n)` variants, and only inside its own column — which is why control shortcodes
require the state file.

**The standard web part list is copied, not deep-imported** (`src/models/StandardWebPart.ts`), as
the note at the end of this plan suggested. 27 fixed ids beat an unversioned import from the CLI's
`dist`.

**No `doctor.json` setting, and no schema change.** Open question 1 was decided as proposed. The
schema question it raised is resolved too: `schema/2.1.0.json` already covers every `doctor.json`
option the code reads, and 2.2.0 added none, so there is nothing for a 2.2.0 or 2.3.0 schema file
to say. Its `$id` pointed at `2.0.0.json` and was corrected, and the `doctor.json` docs page now
points at the same 2.1.0 schema `doctor init` writes.

**One thing added that the plan did not call for:** the access token is cached per site for ten
minutes. Each page now does a read and a write over REST, and `AccessToken.get()` runs two CLI
commands every time.

**State discipline.** Segmentation is a pure exported function holding nothing, so it needs no
`reset()`. `CanvasHelper` caches the web part definitions and the token, and is registered in
`Commands.resetRuntimeState()`.

**Not verified against a tenant.** 46 tests cover segmentation, the shortcode registry and canvas
composition — including reordering, removal, and leaving foreign controls alone. The REST calls
themselves (checkout, `SavePageAsDraft`, `getclientsidewebparts()`) are exercised by nothing but a
real publish.

### Files

| File | Change |
| --- | --- |
| `src/models/Shortcode.ts` | `kind`, the control render contract and its context |
| `src/models/PageSegment.ts` | new — the segment union |
| `src/models/StandardWebPart.ts` | new — the OOTB web part ids and the Markdown web part id |
| `src/helpers/ShortcodesHelpers.ts` | carry `kind` through `init()`, reject an unknown one, keep control tags out of the inline parser |
| `src/helpers/SegmentsHelper.ts` | new — pure segmentation and the tag probe |
| `src/helpers/CanvasHelper.ts` | new — compose `CanvasContent1`, check out, save, resolve web part definitions |
| `src/helpers/PagesHelper.ts` | `applySegments()` replaces `insertOrCreateControl()` |
| `src/helpers/MarkdownHelper.ts` | `getWebPartData()`, and `includeStyles` on `getHtmlData()` |
| `src/helpers/StateHelper.ts` | `controls` per slug, with `getControls()`/`setControls()` |
| `src/helpers/DoctorTranspiler.ts` | segment the page and call `applySegments()` |
| `src/main.ts` | `CanvasHelper.reset()` |
| `tests/segments.test.mjs`, `tests/canvas.test.mjs`, `tests/control-shortcodes.test.mjs` | new |
| `docs/.../shortcodes/control/index.md` | new page, sidebar entry, `kind` on the overview |
| `changelog.json` | 2.3.0 entry |

## Downstream motivation (context, not part of this repo's implementation)

A consumer repo (Involv's SharePoint intranet docs) wants a `<related-pages />` shortcode that
renders as a live SharePoint search web part showing pages related by metadata/tags, instead of a
hand-curated link list. That only becomes possible once control shortcodes exist — it is currently
documented there as an inert placeholder shortcode with a "Status: placeholder, not yet implemented
in Doctor" note, pending this feature.

For the record, that use case needs no SPFx: the web part is the OOTB Highlighted Content one,
`standardWebPart: "ContentRollup"` (`daf0b71c-6de8-4ef7-b511-faae7c388708`), so it is reachable
through the `--standardWebPart` branch of §3.

## Change History

| Date | Change |
|---|---|
| 2026-09-10 | Initial draft |
| 2026-09-15 | Implemented. Publish path decided: compose `CanvasContent1` and write it in one call, replacing the CLI add/set loop for every page. Three combinations that §6/§7 listed as known limits are refused instead: `toc` plus a control shortcode, a control shortcode on a machine translated page, and one published with `--disableStatePersistence`. Added an [As built](#as-built) section with the decisions, the deviations and the file list. |
| 2026-09-15 | Revised after review against the code and `@pnp/cli-microsoft365` 11.5.0. Corrected three claims: the `beforeMarkdown` constraint in §1 (control tags must be kept out of the inline registry, not positioned within it), the reconciliation marker in §4 (`searchablePlainTexts.code` is page content, not hidden metadata — use `StateHelper`), and "`page control remove` is already used elsewhere" in §4 (it is not; `--removeDeleted` recycles pages). Added: `--order` insert-position semantics and the impossibility of reordering via `page control set` (§3), the `CanvasContent1` PATCH alternative (§3), title-scheme fragility (§4), new §6 on CSS duplication / `toc` / anchor-slug breakage when splitting a document, new §7 on the `allowHtml` gate and multilingual, `StateHelper` and the schema-version note in the scope list, and proposed answers to all three open questions. |
