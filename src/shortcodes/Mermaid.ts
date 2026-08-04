import { ShortcodeRender } from "@models";

const MERMAID_ESM = `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs`;

export const MermaidRenderer: ShortcodeRender = {
  render: (_attrs: any, markup: string) => {
    return `<script type="module">
  import mermaid from '${MERMAID_ESM}';
</script>
<pre class="mermaid">
${(markup || "").trim()}
</pre>`;
  },
  beforeMarkdown: true,
};
