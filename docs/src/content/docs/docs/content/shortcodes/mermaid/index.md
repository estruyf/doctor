---
title: Mermaid
sidebar:
  order: 3
---

The `mermaid` shortcode allows you to render [Mermaid](https://mermaid.js.org/) diagrams on your SharePoint pages. Place your Mermaid code between the `<mermaid>` tags, and `Doctor` draws the diagram while publishing.

Example:

```html
<mermaid>
flowchart LR
    id["Doctor supports Mermaid diagrams!"]
</mermaid>
```

The shortcode renders the finished diagram, uploads it to your asset library and puts it on the page as an image:

```html
<div class="doctor__mermaid">
  <img src="https://<tenant>.sharepoint.com/<assets>/mermaid/doctor-mermaid-a1b2c3d4e5.svg"
       width="527" height="548" alt="Mermaid diagram" />
</div>
```

The file is named after the contents of the diagram, so it lands in a `mermaid` folder in the asset library you already publish images to, and re-publishing the same diagram reuses the same file.

Because the diagram is drawn on your machine, the page needs no script, no CDN, and no tenant configuration to show it. The Mermaid version is the one `Doctor` ships, so your diagrams do not change when SharePoint updates its own.

:::note[Why the diagram is drawn while publishing]
`Doctor` hands its HTML to the SharePoint Markdown web part, which injects it into the page. A `<script>` tag that arrives that way never runs, so a diagram cannot be rendered in the browser from `Doctor` its output. SharePoint has its own Mermaid support and would pick up the diagram instead, with whichever version SharePoint ships. Rendering while publishing avoids both problems.
:::

## Why an uploaded image

SharePoint sanitizes the HTML it puts on a page. It removes `<style>` elements and the root `<svg>` itself, so an inline diagram loses both its colours and the coordinate system that places its shapes. It also drops a `data:` source from an image. A file in the asset library is the one form SharePoint serves untouched: the browser fetches it as a document of its own, where the sanitizer never reaches, and the diagram arrives exactly as it was drawn.

A `style` or `classDef` statement therefore keeps working:

```html
<mermaid>
flowchart TD
    A[Write docs in Markdown] --> B[Run doctor publish]
    B --> C{Validation passed?}
    C -->|Yes| D[SharePoint page updated]
    C -->|No| E[Fix issues]
    E --> B
    style A fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    style D fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style E fill:#ffebee,stroke:#c62828,stroke-width:2px
</mermaid>
```

The diagram is published at the size Mermaid calculated, and scales down when the web part is narrower than the diagram.

Give the image a description with the `alt` attribute:

```html
<mermaid alt="How a page gets published">
flowchart LR
    A[Markdown] --> B[SharePoint]
</mermaid>
```

## Supported diagram types

`Doctor` renders without a browser, which covers most, but not all, of the Mermaid syntax:

| Supported                                                                                                   | Not supported                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `pie`, `gitGraph`, `journey`, `timeline`, `quadrantChart`, `xychart-beta`, `architecture-beta`, `gantt`, `sankey-beta` | `mindmap`, `C4Context`, `block-beta` |

A diagram type `Doctor` cannot draw is published as a `<pre class="mermaid">` block instead, together with a warning during the publish. SharePoint renders those with its own Mermaid support, when your tenant has it.

A diagram with a syntax error is reported during the publish as well, so you find out before the page is live:

```bash
 Warning:  Doctor could not render a Mermaid diagram: Parse error on line 2 ...
```

:::note[Note]
As the shortcode is parsed as HTML, you cannot use the `<` character in your diagram definition. Use the `&lt;` HTML entity instead, and `Doctor` passes the right character on to Mermaid.
:::
