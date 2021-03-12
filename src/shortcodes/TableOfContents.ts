import { ShortcodeRender } from "src/models";

export const TableOfContentsRenderer: ShortcodeRender = {
  render: (attrs: { title: string, position: string }) => {
    if (attrs) {
      return `<div class="doctor__container__toc ${attrs.position === "right" ? "doctor__container__toc_right" : ""}">
  ${ attrs.title ? `<h2>${attrs.title}</h2>
  
  `: "" }
  [[toc]]
</div>`;
    }
    return `[[toc]]`;
  },
  beforeMarkdown: true
}