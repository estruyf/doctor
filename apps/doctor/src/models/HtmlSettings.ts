/**
 * How doctor turns a markdown file into a SharePoint page.
 *
 * - `webpart`: a modern `.aspx` page holding the content in Markdown web parts.
 * - `html`: a self-contained `.html` file in the Site Pages library, which
 *   SharePoint renders as an HTML page.
 */
export type PageMode = "webpart" | "html";

export const PAGE_MODES: PageMode[] = ["webpart", "html"];

/**
 * The `html` section of doctor.json, used when `pageMode` is `html`.
 */
export interface HtmlSettings {
  /**
   * A custom HTML file to lay the pages out with, instead of doctor's own.
   */
  template?: string;
  /**
   * A CSS file added after doctor's own styles, to restyle the pages.
   */
  styles?: string;
}
