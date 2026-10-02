# Plan: make change detection precise, not just safe

Status: draft / not started
Author: proposed via AI coding agent session, for @estruyf to review
Related: follow-up to "change detection covers what a page is built from, not just its text"
([DependencyHelper.ts](../../src/helpers/DependencyHelper.ts)), observed while testing that change

## Problem

Change detection now hashes everything a page renders *from*, not only its own text: its partials,
the images it references, the slugs of the pages it links to, the publish settings, the custom
shortcodes, and (with `--reapplyTemplates`) its page template. That fixed the real bug — pages that
quietly went stale because the thing they rendered from had moved — and the trade it makes is
deliberate: **it errs towards republishing.**

The cost is that some pages are republished although nothing about their published output changed.
The hash is over a page's *inputs*, and two different inputs can produce byte-identical output.
Concretely:

| Cause | Fans out to | Why the output is often identical |
| --- | --- | --- |
| `configHash` — any change to a tracked `doctor.json` setting, or to **any** file in the shortcodes folder | **every page on the site** | A page that uses none of the custom shortcodes renders exactly as before. Editing one shortcode republishes the whole site. |
| A referenced image's bytes change | every page referencing it | The image has to be re-uploaded, but the page's canvas HTML still points at the same asset URL, so the page write itself is wasted. |
| `partials.header` / `partials.footer` | every page | Correct today — they really do land on every page — but it means any header tweak is a full-site republish, with no way to tell it apart from the case above. |
| A linked page's slug | every page linking to it | Correct: the link URL genuinely changes. Listed for completeness. |
| `pageTemplate` / `reapplyTemplates` in the config hash | every page | Changing the default template only matters to pages that resolve to it. |

None of this produces a wrong page. It produces extra writes — and a page write is the expensive
part of a run, roughly eight to ten SharePoint round trips
(see [concurrent-publishing.md](concurrent-publishing.md)). On a large site a one-line shortcode edit
turns into a full republish.

## Why it was built this way

Under-publishing is silent and the user finds out weeks later from a stale page; over-publishing is
visible, slow, and correct. Given the choice with no output-level check available, the coarse hash is
the right default, and it should stay the default until something finer is demonstrably safe.

## The fix worth doing: compare the output, not just the inputs

The input hash decides whether a page is worth *rendering*. A second hash should decide whether it is
worth *writing*.

1. Keep `sourceHash` exactly as it is — it stays the gate for "do we need to look at this page at
   all", and stays deliberately over-eager.
2. After rendering and after the assets are uploaded (so asset URLs are settled), hash what would
   actually be sent: the composed `CanvasContent1`, the page header payload, the metadata field
   values, the description and the title. Store it in the state entry as `outputHash`.
3. If `outputHash` is unchanged, skip the writes — `SavePageAsDraft`, `page header set`,
   `listitem set`, publish — and still record the run. The render and the asset upload have already
   happened, which is the point: the image gets re-uploaded, the page does not get republished.
4. `--forceAll` bypasses both hashes, as it does today.

This collapses every row in the table above into "rendered, output identical, nothing written" and
costs one page GET instead of eight to ten writes. It also composes with the concurrency work rather
than competing with it.

Worth checking while implementing: whether SharePoint's own canvas round-trips are stable enough for
a composed-canvas hash to match across runs (it normalizes some attributes), or whether the hash
needs to be taken over doctor's composed input before it is sent rather than over what comes back.

## Cheaper refinements, if the output hash turns out not to be viable

- **Scope the shortcode hash per page.** `ShortcodesHelpers` already knows which shortcodes a page
  used; feeding only those into the page's hash, instead of the whole folder into the global config
  hash, removes the largest fan-out on its own.
- **Split the config hash by what it affects.** `webPartTitle` and `markdown.*` really do affect
  every page; `pageTemplate` only affects pages that resolve to it.
- **Separate image identity from image content.** Hash the resolved asset URL for the page hash, and
  keep the content hash only for deciding whether to re-upload.

## Not in scope

Dropping any input from the hash without a replacement check. The previous behaviour — pages going
stale with no indication — is worse than the extra writes, and this plan is only worth doing if it
keeps that property.
