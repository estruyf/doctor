---
title: Shortcodes
date: 2021-02-22T10:06:07.167Z
lastmod: 2021-02-22T10:06:07.167Z
weight: 5
draft: false
keywords:
  - ''
---

## Shortcodes provided by Doctor

Shortcodes are HTML snippets inside your content files calling built-in or custom templates. You can use these shortcodes like custom HTML elements. Similar like custom web components.

Example:

```html
<icon name="Share" />
```

## Provide your own shortcodes

You can add custom shortcodes to your project by adding a JavaScript file to the `shortcodes` folder (If you want, you can change this location - [Markdown publishing settings](../options/#markdown-publishing-settings)). The contents of the JavaScript file should contain the following:

```javascript
// Usage in Markdown: <shortcode-name name="name attribute">the content</shortcode-name>
module.exports = {
  name: "shortcode-name",
  render: (attributes, html) => {
    return `<div>Name: ${attributes.name} - HTML: ${html}</div>`
  }
};
```