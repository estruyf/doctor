---
title: Shortcodes
sidebar:
  order: 4
  label: Overview
---

Shortcodes are HTML snippets inside your content files calling built-in or custom templates. You can use these shortcodes like custom HTML elements. Similar like custom web components.

:::caution[Important]
Shortcodes only work when `Doctor` renders the HTML, which you turn on with [`markdown.allowHtml`](../../configuration/doctor-json/#markdown-publishing-settings). Without it, SharePoint renders your markdown and a shortcode ends up on the page as plain text.

Edit those pages in markdown only: the content is rebuilt from the file on every publish, so an edit made on SharePoint is overwritten.
:::

`Doctor` has built-in shortcodes, but also supports you to create your own shortcodes. If you are missing something, or have a special requirement, this will allow you to make it possible.

At the moment, `doctor` has the following built-in shortcodes:

- [Callout](./callout/)
- [Icon](./icon/)
- [Mermaid](./mermaid/)
- [Table of contents](./toc/)

A shortcode can also become a SharePoint web part of its own instead of returning HTML — see [web part shortcodes](./webpart/).

## Provide your own shortcodes

You can add custom shortcodes to your project by adding a JavaScript file to the `shortcodes` folder (If you want, you can change this location - [Markdown publishing settings](../../configuration/doctor-json/#markdown-publishing-settings)). The contents of the JavaScript file should contain the following:

**ES module syntax** (use this when your `package.json` contains `"type": "module"`):

```javascript
// Usage in Markdown: <shortcode-name name="name attribute">the content</shortcode-name>
export default {
  name: "shortcode-name",
  render: (attributes, html) => {
    return `<div>Name: ${attributes.name} - HTML: ${html}</div>`;
  },
  beforeMarkdown: false,
};
```

**CommonJS syntax** (use this when your `package.json` does not contain `"type": "module"`, or rename your file to `.cjs`):

```javascript
// Usage in Markdown: <shortcode-name name="name attribute">the content</shortcode-name>
module.exports = {
  name: "shortcode-name",
  render: (attributes, html) => {
    return `<div>Name: ${attributes.name} - HTML: ${html}</div>`;
  },
  beforeMarkdown: false,
};
```

:::note[Note]
`Doctor` picks up `.js`, `.cjs` and `.mjs` files from the shortcodes folder. If your project uses `"type": "module"` in `package.json` and you want to keep CommonJS syntax, rename your shortcode file from `.js` to `.cjs`; use `.mjs` to keep ESM syntax in a project which does not.
:::

`beforeMarkdown`
: This is an optional property introduced to specify if you want to parse the shortcode before or after the Markdown gets processed. In case you include your own Markdown code with your shortcode, you can set this property to `true`. Otherwise keep it set to `false`, or leave it out.

`kind`
: Optional, `"inline"` by default. Set it to `"webpart"` to have the shortcode become its own SharePoint web part rather than HTML inside the Markdown web part — see [web part shortcodes](./webpart/). Any other value stops the publish with an error.
