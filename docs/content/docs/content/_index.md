---
title: Content
date: 2026-08-05T00:00:00.000Z
lastmod: 2026-08-05T00:00:00.000Z
weight: 2
draft: false
keywords:
  - ""
---

This section is about the source of your site: the Markdown files you write, and everything `doctor` does with them while publishing.

## Sections

- [Pages](./pages): the front matter every Markdown page supports, like the title, slug, template, and page level settings.
- [Navigation](./navigation): how the Quick Launch and top navigation get built from your pages and folder structure.
- [Markdown syntax](./markdown-syntax): which syntax gets rendered by SharePoint, and which extras become available when `Doctor` renders the HTML.
- [Shortcodes](./shortcodes): built-in and custom HTML snippets like callouts, icons, Mermaid diagrams, and a table of contents.
- [Partials](./partials): reusable Markdown snippets which you write once and add to multiple pages.
- [Multilingual](./multilingual): linking pages to their translations, manually or with machine translation.

## Where your content lives

By default `doctor` reads your Markdown files from the `./src` folder. You can change this with the `-f, --folder` option, or the `folder` property in your [`doctor.json`](../configuration/doctor-json) file.

```
.
├── doctor.json
├── partials/          # reusable snippets
├── shortcodes/        # custom shortcodes
└── src/               # your markdown pages and images
```
