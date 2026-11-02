/**
 * A page is cut into segments at every top-level web part shortcode, so one
 * Markdown document can become several SharePoint controls. A page without a
 * web part shortcode yields exactly one `markdown` segment holding the whole
 * document, which is the input the single Markdown web part gets today.
 */
export type PageSegment = MarkdownSegment | WebPartSegment;

export interface MarkdownSegment {
  type: "markdown";
  content: string;
}

export interface WebPartSegment {
  type: "webpart";
  shortcode: string;
  attributes: { [name: string]: string };
}
