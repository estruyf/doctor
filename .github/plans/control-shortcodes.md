# Plan: control shortcodes — splitting a page into multiple web parts

Status: draft / not started
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

`kind: "control"` shortcodes are **only valid in `beforeMarkdown: false` position** (after Markdown
parsing would produce HTML per element; before that point the tag hasn't even been isolated as its
own block yet) — validate this in `ShortcodesHelpers.init()` and throw a clear error otherwise,
same style as the existing "Missing render function" check in `ShortcodesHelpers.parse()`.

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

### 3. Publishing: one control per segment, in order

`PagesHelper.insertOrCreateControl()` (singular, one call per page today) becomes a loop driven by
the segment list, replacing the single call in `DoctorTranspiler.ts` around line 608:

- Markdown segments: same `spo page clientsidewebpart add` / `page control set` as today, but with
  a per-segment title (`webPartTitle` for the first, `${webPartTitle} (2)`, `${webPartTitle} (3)`, …
  — needs to stay stable across runs so re-publishing updates in place rather than duplicating) and
  an explicit `--order` equal to the segment's index, so ordering on the canvas matches source order
  regardless of section/column placement.
- Control segments: `spo page clientsidewebpart add` with either `--standardWebPart <type>` (OOTB,
  validated against `StandardWebPartUtils.isValidStandardWebPartType`) or `--webPartId <guid>
  --webPartProperties <json>` (custom/SPFx), plus the same `--order`.
- Single-segment pages (the overwhelming majority, at least initially) take the exact code path used
  today — this should be structured as "loop of 1" rather than a parallel special case, so there is
  only one implementation to maintain.

### 4. Reconciling controls across runs (idempotency)

Today's match is "find the one control whose `webPartData.title === webPartTitle`". With N
controls per page this needs to become:

- Match existing controls by the same title scheme (`webPartTitle`, `${webPartTitle} (2)`, …) for
  markdown segments.
- Match existing control-shortcode controls by a stable marker — simplest option: store the
  shortcode name + a segment index in a property doctor already controls (e.g. a hidden
  `serverProcessedContent` field, similar to how `searchablePlainTexts.code` is used today) so a
  later run can tell "this control belongs to control-shortcode X at position 2" apart from a
  control the page owner added manually on the SharePoint side, which must never be touched.
- Reconcile: `page control set` for controls that still match a current segment, `page
  clientsidewebpart add` for new segments, `page-control-remove` (`--force`, already used
  elsewhere in the codebase for cleanup flows — check `--removeDeleted`'s implementation for the
  existing confirm/force pattern) for controls whose segment disappeared (e.g. the control
  shortcode tag was deleted from the Markdown, or the page went from 3 segments to 1).

### 5. State hash / `doctor status`

`StateHelper` hashes "front matter + content + partials" per slug — a control shortcode's
attributes are part of that same Markdown content, so the existing hash already invalidates
correctly when a control shortcode's attributes change. No new hashing logic should be needed here,
but this needs to be verified with a test once implemented, since the segmentation pass reads from
the same resolved source string the hash is computed from.

## Scope check against `AGENTS.md`

This is a real feature, not a one-file patch. Per "Definition of done", the following move together
in the same change:

- `src/models/Shortcode.ts` (or wherever the `Shortcode` type lives) — add `kind` and the
  `ControlShortcodeResult` return shape.
- `src/helpers/ShortcodesHelpers.ts` — validate `kind: "control"` only applies to
  `beforeMarkdown: false`, expose a way to ask "is this tag a control shortcode".
- `src/helpers/MarkdownHelper.ts` (or new `SegmentsHelper.ts`, exported from `src/helpers/index.ts`)
  — the segmentation pass.
- `src/helpers/PagesHelper.ts` — loop + reconcile instead of single insert/update.
- `src/helpers/DoctorTranspiler.ts` — call the new loop instead of the single
  `insertOrCreateControl()` call.
- `docs/src/content/docs/docs/content/shortcodes/index.md` — document the `kind` field and the
  control-shortcode contract, with a sidebar entry per "new shortcode" in the definition-of-done
  table.
- `schema/<current>.json` — only if this introduces a new `doctor.json` setting (e.g. an opt-in
  flag, if one turns out to be needed for a transition period).
- `changelog.json` — new entry.
- `tests/` — at minimum: a page with zero control shortcodes still produces one segment/one control
  (regression guard), a page with one control shortcode produces three segments in the right order,
  and a re-publish reconciles correctly (update in place, no duplicate controls).

## Open questions for @estruyf

1. Should `kind: "control"` be opt-in per `doctor.json` (a `markdown.allowControlShortcodes` flag)
   for a transition period, or ship straight as a shortcode-module-level opt-in (safe by
   construction since it requires a new shortcode file to use)?
2. Multi-column pages: today everything lands in `section: 1, column: 1`. Should control-shortcode
   segments support an optional `column`/`section` attribute on the tag itself (e.g.
   `<related-pages column="2" />`), or always flow into the same single column as the surrounding
   markdown segments for v1?
3. Confirm the reconciliation marker approach in step 4 — is there a cleaner existing mechanism
   (e.g. something already used by the translation pipeline to tag "this control belongs to
   doctor") that should be reused instead of inventing a new one?

## Downstream motivation (context, not part of this repo's implementation)

A consumer repo (Involv's SharePoint intranet docs) wants a `<related-pages />` shortcode that
renders as a live SharePoint search web part showing pages related by metadata/tags, instead of a
hand-curated link list. That only becomes possible once control shortcodes exist — it is currently
documented there as an inert placeholder shortcode with a "Status: placeholder, not yet implemented
in Doctor" note, pending this feature.

## Change History

| Date | Change |
|---|---|
| 2026-09-10 | Initial draft |
