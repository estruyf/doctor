---
title: Partials
sidebar:
  order: 5
---

Partials are reusable markdown snippets. Instead of copying the same navigation, banner, or feedback block on every page, you write it once and let `Doctor` add it while it publishes your pages.

By default, `Doctor` looks for these snippets in the `./partials` folder. You can change this with the `partials.folder` setting:

```json
{
  "partials": {
    "folder": "./partials"
  }
}
```

:::note[Info]
A partial is a plain markdown file. It may contain front matter, so it stays a valid markdown file in your editor, but that front matter is not used.
:::

## Including a partial

Use the `include` tag on the location where you want the content of the partial to appear:

```markdown
<include file="navigation" />
```

The `file` attribute is looked up as follows:

- `navigation`: in the partials folder. The `.md` extension is optional.
- `./navigation` or `../navigation`: relative to the file which includes it.
- `/navigation`: relative to your sources folder (`./src` by default).

Partials can include other partials, as long as they don't end up including themselves.

:::note[Info]
`include` tags inside code blocks are left untouched, so you can document them on your pages.
:::

## Adding a partial to every page

When a partial belongs on all of your pages, let `Doctor` add it for you with the `header` and `footer` settings:

```json
{
  "partials": {
    "folder": "./partials",
    "header": "banner",
    "footer": "navigation"
  }
}
```

The `header` partial is added at the top of every page, the `footer` partial at the bottom.

Pages which don't need them can opt out in their front matter:

```markdown
---
title: My page
partials: false
---
```

Or opt out of one of them:

```markdown
---
title: My page
partials:
  footer: false
---
```

:::note[Info]
The opt-out only applies to the partials which get added to every page. The ones you place yourself with an `include` tag are always added.
:::

## Links in a partial

The same partial ends up on pages in different folders, so `Doctor` rewrites its links to the page which includes it. This means you write the links of your partial from the location of the partial itself, or from your sources folder when you start the link with a `/`:

```markdown
## Navigation

- [Home](/home)
- [Documentation](/doctor/documentation)
  - [Options](/doctor/options)
- Test pages
  - [Codeblocks](/tests/codeblocks)
```

The same applies to the images of a partial, which get uploaded like the images of a page.

:::note[Info]
A link to `.` keeps pointing at the page the partial is included on. Links to other sites are left untouched.
:::

## What it means for publishing

The partials are part of your page, which means they are processed like the rest of your content:

- Their links and images are resolved and uploaded.
- A page is republished when one of the partials it uses has changed. The [`doctor status`](../../cli/#status) command shows those pages as modified as well.

:::caution[Important]
Store your partials outside of your sources folder, or `Doctor` will publish them as pages. When they do live inside it, `Doctor` excludes the configured `partials.folder` from the pages it picks up.
:::
