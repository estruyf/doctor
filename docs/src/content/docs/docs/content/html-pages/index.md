---
title: HTML pages (beta)
description: Publish your markdown as self-contained HTML pages, which SharePoint renders as pages of their own.
sidebar:
  order: 2
---

:::caution[Beta]
The `html` page mode is in beta. Try it out, and share what you run into through
[feedback](../../about/feedback/), but know its limits before you switch a production site over:

- SharePoint's HTML pages are themselves still in preview (Microsoft 365 roadmap 569208), generally
  available from December 2026. Check that your tenant has them: on a site that does, the **+ New** menu
  offers an HTML page.
- [Moving between HTML pages in the site navigation](#known-issue-moving-between-html-pages-in-the-site-navigation)
  does not load the next page until the browser is reloaded. This is a SharePoint bug.
- [Multilingual sites and web part shortcodes](#not-supported-yet) are not supported.
- The default design, and the `html` settings, can still change between `Doctor` releases.
:::

SharePoint can render an `.html` file in the Site Pages library as a page. With the `html` page mode,
`Doctor` publishes every markdown file as one of those: a complete HTML document with its own design,
instead of a modern page with Markdown web parts.

```json
{
  "pageMode": "html"
}
```

Or for a single run: `doctor publish --pageMode html`.

## What you get

Every page goes through the same markdown pipeline as a Markdown web part, so a page reads the same in
either mode:

- the [markdown syntax](../markdown-syntax/), including the extended syntax
- highlighted code blocks, in the [`markdown.theme`](../../configuration/doctor-json/#markdown-publishing-settings) you configured
- the [shortcodes](../shortcodes/): callouts, icons, the table of contents, Mermaid diagrams and your own
  shortcodes. In this mode they do not need `markdown.allowHtml`, as the page is HTML anyway.
- the [partials](../partials/), including the automatic header and footer
- links between your pages, which point at the `.html` pages
- the page `title` and `description`, which become the page's title, its description column and the
  banner at the top of the page
- [page metadata](../pages/#metadata), written to the columns of the Site Pages library
- `draft`, which leaves the page unpublished
- [`homepage: true`](../pages/#optional-front-matter), which makes the HTML page the site's homepage
- [navigation](../navigation/), [change detection](../../configuration/doctor-json/#change-detection)
  and [`removeDeleted`](../../configuration/doctor-json/#removedeleted), which work as they do for
  modern pages

## Everything inside one file

SharePoint shows an HTML page in a sandbox. Inline styles, scripts and SVG work, but the page cannot load
anything from elsewhere: no stylesheets or scripts from a URL, no `fetch` calls, and no images from
other sites. `Doctor` therefore puts everything a page needs inside the page itself:

| Content | In an HTML page |
| --- | --- |
| Images in your sources | Embedded in the page. Nothing is uploaded to the asset library. |
| Images from other sites | Downloaded while publishing and embedded. If the download fails, the image stays a link, and `Doctor` warns that it will not show. |
| Images on your own SharePoint site | Kept as links. The sandbox allows them, and they need the reader's permissions anyway. |
| Mermaid diagrams | Drawn while publishing and placed in the page as SVG. |
| Styles | One stylesheet in the page. |

When a page still contains something the sandbox blocks, `Doctor` warns about it during the publish. That
can come from a custom shortcode, a partial or a custom template, for example an external `<script src>`.

Embedded images make a page bigger: a page is about as large as its images together. Keep large
screenshots compressed.

## The page design

Every page gets a clean default design: a banner with the page title and description, and a readable
content column with styled code blocks, tables, quotes and callouts.

The banner follows the page's [`header`](../pages/#optional-front-matter) front matter:

- `header.image` shows the image behind the title, with `header.altText` as its description
- `header.layout: NoImage` or `ColorBlock` keeps the plain banner
- `header.textAlignment: Center` centres the title
- `header.type: None` leaves the banner out

### Your own styles

To restyle the pages, point `html.styles` to a CSS file. It is added after the default styles, so it
wins. The design is built on CSS custom properties, so a few lines are often enough to rebrand it:

```json
{
  "pageMode": "html",
  "html": {
    "styles": "./theme/brand.css"
  }
}
```

```css
:root {
  --doctor-accent: #6b2c91;        /* links, the banner and the info callout */
  --doctor-accent-strong: #3d1a54; /* the dark end of the banner gradient */
  --doctor-font: Georgia, serif;
  --doctor-width: 960px;           /* the width of the content column */
}
```

The other properties are `--doctor-text`, `--doctor-muted`, `--doctor-border`, `--doctor-surface`,
`--doctor-background`, `--doctor-radius` and `--doctor-mono`.

### Your own layout

For full control over the page, point `html.template` to an HTML file of your own:

```json
{
  "pageMode": "html",
  "html": {
    "template": "./theme/layout.html"
  }
}
```

The template is filled in with these placeholders:

| Placeholder | Contains |
| --- | --- |
| `{{ title }}` | The page title |
| `{{ description }}` | The page description, or nothing |
| `{{ lang }}` | The page language |
| `{{ styles }}` | The default styles, followed by your `html.styles` |
| `{{ header }}` | The banner, as described above |
| `{{ content }}` | The rendered markdown. Required: a template without it fails the publish. |

```html
<!DOCTYPE html>
<html lang="{{ lang }}">
<head>
  <meta charset="utf-8" />
  <title>{{ title }}</title>
  <style>{{ styles }}</style>
</head>
<body>
  {{ header }}
  <main class="doctor-page">
    <article class="doctor-content">{{ content }}</article>
  </main>
</body>
</html>
```

Keep the `doctor-page` and `doctor-content` classes on the wrappers to keep the default styles for the
content. Changing the template or the styles file publishes every page again.

## Preview your pages locally

As every page is a complete HTML file, you can look at your site without opening SharePoint. Publish with
[`--outputFolder`](../../configuration/cli-options/#publish-command-specific-options), and `Doctor` writes
every page to that folder as it publishes it:

```bash
doctor publish --pageMode html --outputFolder ./preview
```

Open any `.html` file from the folder in your browser. Links between pages point to the pages on
SharePoint.

## Switching an existing site

In the `html` page mode, page URLs end in `.html` instead of `.aspx`. A `slug` in your front matter that
ends in `.aspx` is turned into the `.html` page with the same name, so you do not have to change your
sources.

The modern pages of the old mode are not changed. Doctor publishes the HTML pages next to them, and the
modern pages count as deleted pages. To recycle them in the same run, use
[`--removeDeleted --confirm`](../../configuration/cli-options/#removing-deleted-pages). Switching modes
publishes every page again, as the page mode is part of the publish settings.

## Not supported yet

- **Web part shortcodes.** An HTML page holds no web parts, so a page that uses a
  [web part shortcode](../shortcodes/webpart/) fails with an error.
- **Multilingual sites.** SharePoint creates translations from modern pages only. A publish with
  `multilingual.enableTranslations` and the `html` page mode stops before it changes anything.
- **Page templates, `layout` and `comments`.** These are modern page features. They do nothing for an
  HTML page.

## Known issue: moving between HTML pages in the site navigation

In the current SharePoint preview, the site navigation does not load an HTML page when you come from
another HTML page: the address changes, but the previous page stays on screen. Reloading the browser
shows the right page. This is a bug in SharePoint's HTML page viewer, not in the navigation `Doctor`
creates — the menu items point straight at the pages. Links inside your pages, such as a navigation
[partial](../partials/), are not affected.
