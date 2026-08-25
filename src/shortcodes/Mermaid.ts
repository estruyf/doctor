import { ShortcodeRender } from "@models";
import { MermaidHelper } from "../helpers/MermaidHelper.js";

export const MermaidRenderer: ShortcodeRender = {
  render: async (attrs: any, markup: string) => {
    const diagram = await MermaidHelper.render(markup);

    if (diagram) {
      // The SVG is loaded as its own document. SharePoint strips `<style>`
      // elements and the root `<svg>` out of the HTML it injects, which leaves
      // an inline diagram without its colours and without the coordinate system
      // that places its shapes. Inside an image none of that is reachable.
      const alt = `${attrs?.alt || attrs?.title || "Mermaid diagram"}`.replace(
        /"/g,
        "&quot;"
      );

      return `<div class="doctor__mermaid"><img src="${diagram.src}" width="${diagram.width}" height="${diagram.height}" alt="${alt}" /></div>`;
    }

    // Diagram types Doctor cannot draw without a browser fall back to the
    // markup SharePoint's own Mermaid support recognises, so the content is not
    // lost from the page.
    return `<pre class="mermaid">\n${(markup || "").trim()}\n</pre>`;
  },
  beforeMarkdown: true,
};
