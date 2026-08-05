---
title: Markdown syntax
date: 2026-08-05T00:00:00.000Z
lastmod: 2026-08-05T00:00:00.000Z
weight: 3
draft: false
keywords:
  - ""
aliases:
  - /docs/markdown-syntax/
---

`Doctor` supports more than the basic markdown syntax. Which syntax gets rendered depends on **who** renders your content: SharePoint or `Doctor`.

### Who renders your markdown?

By default, `Doctor` hands your markdown over to the SharePoint markdown web part, and SharePoint renders it. That web part only supports the basic syntax: headings, emphasis, paragraphs, code, links, images, lists and tables. Anything beyond that is shown as plain text, and `Doctor` cannot change that.

To use the extended syntax, you have to let `Doctor` render the HTML by enabling the [`allowHtml`](../../configuration/doctor-json/#markdown-publishing-settings) setting:

```json
{
  "markdown": {
    "allowHtml": true
  }
}
```

> **Important**: everything on this page requires `allowHtml` to be enabled. Without it, SharePoint keeps rendering your content and the extended syntax is ignored.

### Extended syntax

Once `Doctor` renders the HTML, the following syntax is available on top of the basic markdown syntax. This is enabled by default and can be turned off with the `markdown.extended` setting.

#### Emoji

Emoji shortcodes are replaced with the actual emoji.

```markdown
:pushpin: Purpose and :pencil2: Definition
```

#### Highlighted text

```markdown
This is ==highlighted== text.
```

#### Footnotes

```markdown
Here is a footnote reference[^1]

[^1]: And here is the footnote itself.
```

#### Definition lists

```markdown
Term
: The definition of the term
```

#### Task lists

```markdown
- [x] Write the documentation
- [ ] Publish the documentation
```

To turn the extended syntax off and keep the previous rendering behaviour:

```json
{
  "markdown": {
    "allowHtml": true,
    "extended": false
  }
}
```

### Math and LaTeX

Math is **not supported**. The SharePoint markdown web part strips the [MathML](https://developer.mozilla.org/docs/Web/MathML) elements from the page and keeps only their text, so a formula ends up on the page as unreadable text instead of as a formula. The regular [KaTeX](https://katex.org/) HTML output is no alternative either, as it depends on a stylesheet and web fonts that cannot be shipped to a SharePoint page.

Your `$...$` and `$$...$$` expressions are left untouched, so they show up as you wrote them.

### Syntax overview

| Syntax             | SharePoint | `Doctor` (`allowHtml: true`)     |
| ------------------ | ---------- | -------------------------------- |
| Headings           | Yes        | Yes                              |
| Emphasis           | Yes        | Yes                              |
| Lists              | Yes        | Yes                              |
| Links and images   | Yes        | Yes                              |
| Tables             | Yes        | Yes                              |
| Code blocks        | Yes        | Yes, with syntax highlighting    |
| Table of contents  | No         | Yes, via the [toc](../shortcodes/toc) shortcode |
| Inline HTML        | No         | Yes                              |
| [Shortcodes](../shortcodes) | No | Yes                             |
| Emoji              | No         | Yes, with `extended`             |
| Highlighted text   | No         | Yes, with `extended`             |
| Footnotes          | No         | Yes, with `extended`             |
| Definition lists   | No         | Yes, with `extended`             |
| Task lists         | No         | Yes, with `extended`             |
| Math and LaTeX     | No         | No                               |
