/**
 * A page is cut into segments at every top-level control shortcode, so one
 * Markdown document can become several SharePoint controls. A page without a
 * control shortcode yields exactly one `markdown` segment holding the whole
 * document, which is the input the single Markdown web part gets today.
 */
export type PageSegment = MarkdownSegment | ControlSegment;

export interface MarkdownSegment {
  type: "markdown";
  content: string;
}

export interface ControlSegment {
  type: "control";
  shortcode: string;
  attributes: { [name: string]: string };
}
