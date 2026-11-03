/**
 * What a shortcode contributes to the page. An `inline` shortcode returns HTML
 * that is spliced into the Markdown web part; a `webpart` shortcode becomes a
 * SharePoint web part of its own, splitting the page canvas around it.
 */
export type ShortcodeKind = "inline" | "webpart";

export const SHORTCODE_KINDS: readonly ShortcodeKind[] = ["inline", "webpart"];

/** The callout types doctor styles. Any other type is shown as a `note`. */
export const CALLOUT_TYPES = ["note", "tip", "info", "caution", "danger"] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

export interface BuiltInShortcodeAttribute {
  name: string;
  description?: string;
}

/** A shortcode doctor ships, as the extension offers it while typing */
export interface BuiltInShortcode {
  /** The tag as written in the markdown: `<callout …>` */
  tag: string;
  kind: ShortcodeKind;
  /** `true` when the shortcode wraps content: `<callout>…</callout>` */
  paired: boolean;
  description: string;
  /** Only what the renderer reads: an attribute it ignores is wrong advice */
  attributes: readonly BuiltInShortcodeAttribute[];
}

/**
 * The shortcodes doctor ships, which are available in every project. doctor's
 * renderers are the truth, and a test there holds the tags and kinds to them.
 */
export const BUILT_IN_SHORTCODES: readonly BuiltInShortcode[] = [
  {
    tag: "callout",
    kind: "inline",
    paired: true,
    description: "A coloured callout box around its content.",
    attributes: [
      { name: "type", description: `${CALLOUT_TYPES.join(", ")}. Anything else is shown as a note.` },
      { name: "title", description: "Heading shown above the content" },
      { name: "bgColor", description: "Custom background colour, any CSS colour" },
      { name: "fgColor", description: "Custom text colour, any CSS colour" },
    ],
  },
  {
    tag: "icon",
    kind: "inline",
    paired: false,
    description: "A Fluent UI icon.",
    attributes: [{ name: "name", description: "Fluent UI icon name" }],
  },
  {
    tag: "toc",
    kind: "inline",
    paired: false,
    description:
      "A table of contents built from the page headings. Cannot be combined with a web part shortcode.",
    attributes: [
      { name: "title", description: "Heading shown above the table of contents" },
      {
        name: "position",
        description:
          "right, for a sticky table of contents next to the content. Left out, it stays where it is written.",
      },
    ],
  },
  {
    tag: "mermaid",
    kind: "inline",
    paired: true,
    description:
      "A Mermaid diagram, drawn during the publish at the size Mermaid calculates, and uploaded as an image.",
    attributes: [
      { name: "alt", description: "Image description" },
      { name: "title", description: "Used as the image description when there is no alt" },
    ],
  },
];
