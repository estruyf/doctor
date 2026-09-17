export interface Shortcode {
  [name: string]: ShortcodeRender;
}

/**
 * What a shortcode contributes to the page. An `inline` shortcode returns HTML
 * that is spliced into the Markdown web part; a `control` shortcode becomes a
 * SharePoint control of its own, splitting the page canvas around it.
 */
export type ShortcodeKind = "inline" | "control";

export const SHORTCODE_KINDS: ShortcodeKind[] = ["inline", "control"];

/**
 * Page-level facts a control shortcode may need to build its web part
 * properties, so every shortcode author doesn't have to re-derive them.
 */
export interface ControlShortcodeContext {
  frontMatter: { [key: string]: any };
  slug: string;
  webUrl: string;
}

/**
 * What a control shortcode returns: either an out-of-the-box web part by name,
 * or a custom/SPFx one by id. `webPartProperties` is passed through untouched.
 */
export interface ControlShortcodeResult {
  standardWebPart?: string;
  webPartId?: string;
  /** Merged over the web part's own default properties */
  webPartProperties?: any;
  /**
   * Merged over the whole web part data, for the web parts which keep state
   * outside `properties` — `dynamicDataValues` and `containsDynamicDataSource`
   * on a web part that takes a connection, for instance. `id` and `instanceId`
   * are always doctor's, so a value for either is ignored.
   */
  webPartData?: any;
  title?: string;
}

export interface InlineShortcodeRender {
  kind?: "inline";
  render: (attr: any, markup: string) => Promise<string> | string;
  beforeMarkdown: boolean;
}

export interface ControlShortcodeRender {
  kind: "control";
  render: (
    attr: any,
    context: ControlShortcodeContext,
  ) => Promise<ControlShortcodeResult> | ControlShortcodeResult;
  beforeMarkdown: boolean;
}

export type ShortcodeRender = InlineShortcodeRender | ControlShortcodeRender;
