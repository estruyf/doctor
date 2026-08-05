---
title: Shortcodes
sidebar:
  order: 4
  label: Overview
---

Shortcodes are HTML snippets inside your content files calling built-in or custom templates. You can use these shortcodes like custom HTML elements. Similar like custom web components.

:::caution[Important]
When allowing `Doctor` to take over for rendering the HTML, be aware that the pages can best not be modified on SharePoint. Otherwise the web part will override the HTML completly.
:::

`Doctor` has built-in shortcodes, but also supports you to create your own shortcodes. If you are missing something, or have a special requirement, this will allow you to make it possible.

At the moment, `doctor` has the following built-in shortcodes:

- [Callout](./callout/)
- [Icon](./icon/)
- [Mermaid](./mermaid/)
- [Table of contents](./toc/)

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
If your project uses `"type": "module"` in `package.json` and you want to keep CommonJS syntax, rename your shortcode file from `.js` to `.cjs`.
:::

`beforeMarkdown`
: This is an optional property introduced to specify if you want to parse the shortcode before or after the Markdown gets processed. In case you include your own Markdown code with your shortcode, you can set this property to `true`. Otherwise you keep ot set to `false` or do not include it.
