import { ShortcodeRender } from "src/models";

export const TableOfContentsRenderer: ShortcodeRender = {
  render: () => {
    return `[[toc]]`;
  },
  beforeMarkdown: true
}