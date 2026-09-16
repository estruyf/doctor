---
title: Control shortcodes
description: Let a shortcode become its own SharePoint web part instead of HTML inside the Markdown web part.
sidebar:
  order: 5
---

A normal shortcode returns HTML, which `doctor` splices into the one Markdown web part a page becomes. A **control shortcode** returns a web part instead: `doctor` cuts the page at that point and puts a real SharePoint web part between the parts of your content.

Use it when what you want cannot be static HTML — a search-driven list of related pages, a `List` web part, a `Hero`, or your own SPFx web part.

```markdown
# Release notes

Everything that shipped this month.

<related-pages />

Questions? Ask in the team channel.
```

That page becomes three controls on the SharePoint canvas, in that order: a Markdown web part, the web part `related-pages` asked for, and another Markdown web part.

## Writing one

A control shortcode is a normal shortcode file with `kind: "control"`. Its `render` returns a web part description rather than a string:

```javascript
// shortcodes/related-pages.cjs
module.exports = {
  name: "related-pages",
  kind: "control",
  render: (attributes, context) => ({
    standardWebPart: "ContentRollup",
    webPartProperties: {
      maxItemsPerPage: Number(attributes.count ?? 3),
      // Anything the web part accepts, passed through untouched
    },
  }),
};
```

`standardWebPart`
: The name of an out-of-the-box SharePoint web part, such as `ContentRollup` (Highlighted content), `List`, `Hero`, `Events`, `QuickLinks` or `Image`.

`webPartId`
: The id of a custom or SPFx web part, when it is not one of the standard ones. Use this *or* `standardWebPart`, not both.

`webPartProperties`
: Merged over the web part's default properties. What is valid here is up to the web part.

`title`
: Optional. Overrides the title SharePoint gives the web part.

`webPartData`
: Optional, and merged over the whole web part data rather than just its properties. Some web parts
  keep state outside `properties` — a PnP Modern Search *Search Results* web part sets
  `containsDynamicDataSource` and `dynamicDataValues` so other web parts can connect to it, for
  instance. `id` and `instanceId` are always `Doctor`'s, so a value for either is ignored.

`context`
: The second argument of `render`, holding the page's `frontMatter`, its `slug` and the `webUrl`, so you do not have to re-derive them.

The shortcode must live in the shortcodes folder like any other — see the [overview](../) for where that is and how ES module and CommonJS files differ.

## Where the tag may go

A control shortcode becomes a web part of its own, so there is nowhere for surrounding text to go. The tag has to sit **on a line of its own, unindented, without a body**:

```markdown
<related-pages />
<related-pages count="5" />
<related-pages></related-pages>
```

Anything else fails the publish with an error rather than being rendered as text:

```markdown
See <related-pages /> below     <!-- inside a paragraph -->
- <related-pages />             <!-- inside a list item -->
> <related-pages />             <!-- inside a blockquote -->
  <related-pages />             <!-- indented -->
<related-pages>text</related-pages>
```

As with every shortcode, an occurrence inside a code fence or inline code is a code sample and is left alone.

Attribute values may contain a `>` as long as they are quoted, which a search query often needs:

```markdown
<related-pages query="Size>1000" path="/sites/docs" />
```

Values reach your `render` function exactly as they are written — HTML entities are not decoded, the
same way they are not for inline shortcodes, so `&gt;` arrives as `&gt;`.

## What to know before you use one

:::caution[The publish state is required]
`doctor` recognises the web parts it created through `.doctor/state.json`. Without it there is no way to tell your `related-pages` web part apart from one somebody added in SharePoint, so a page using a control shortcode cannot be published with `--disableStatePersistence`.
:::

- **`markdown.allowHtml` must be on.** Shortcodes are only loaded when it is; without it the tag ends up as literal text in the page.
- **A table of contents cannot be combined with one.** Each part of the page is rendered on its own, so a `<toc />` would only list the headings next to it. `doctor` refuses the page rather than publishing a half-empty table of contents.
- **Headings are numbered per part.** Two identical headings in different parts of the same page get the same anchor, and footnotes restart their numbering. Reference-style link definitions only resolve inside the part they sit in.
- **Machine translated pages cannot use one.** They reach the publish step as HTML, so there is no Markdown left to split.
- **Web parts you added by hand are left alone.** `doctor` only rewrites the controls it created itself, and keeps everything else on the page where it is.
- **The web part has to be deployed to the site.** `Doctor` reads its definition from SharePoint to build a new instance from, so a `webPartId` the site does not offer, or one whose definition carries no preconfigured entry, is reported by name. A web part in the latter case can still be used if the shortcode supplies the instance data itself with `webPartData`.
