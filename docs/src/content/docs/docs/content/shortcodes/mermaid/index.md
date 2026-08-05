---
title: Mermaid
sidebar:
  order: 3
---

The `mermaid` shortcode allows you to render [Mermaid](https://mermaid.js.org/) diagrams on your SharePoint pages. Place your Mermaid code between the `<mermaid>` tags and `Doctor` outputs it as a diagram which gets rendered in the browser.

Example:

```html
<mermaid>
flowchart LR
    id["Doctor supports Mermaid diagrams!"]
</mermaid>
```

The shortcode renders the following HTML:

```html
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
</script>
<pre class="mermaid">
flowchart LR
    id["Doctor supports Mermaid diagrams!"]
</pre>
```

:::caution[Important]
The Mermaid library is loaded from the [jsDelivr](https://www.jsdelivr.com/) CDN. Make sure this CDN is not blocked on your tenant, otherwise the diagram will show up as plain text.
:::

:::note[Note]
As the shortcode is parsed as HTML, you cannot use the `<` character in your diagram definition. Use the `&lt;` HTML entity instead.
:::
