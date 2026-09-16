import { join } from "path";
import { pathToFileURL } from "url";
import fg from "fast-glob";
import * as cheerio from "cheerio";
import {
  IconRenderer,
  CalloutRenderer,
  MermaidRenderer,
  TableOfContentsRenderer,
} from "../shortcodes/index.js";
import {
  ControlShortcodeRender,
  InlineShortcodeRender,
  SHORTCODE_KINDS,
  Shortcode,
  ShortcodeKind,
  TocPosition,
} from "@models";
import { Logger } from "@helpers";
import { existsAsync } from "@utils";

const defaultShortcodes: Shortcode = {
  icon: IconRenderer,
  callout: CalloutRenderer,
  mermaid: MermaidRenderer,
  toc: TableOfContentsRenderer,
};

const CODE_PLACEHOLDER_PREFIX = `%%DOCTOR_CODE_`;
const CODE_PLACEHOLDER_SUFFIX = `%%`;
const CODE_PLACEHOLDER_REGEX = /%%DOCTOR_CODE_(\d+)%%/g;

export class ShortcodesHelpers {
  private static shortcodes: Shortcode = { ...defaultShortcodes };

  /**
   * Initialize the shortcodes
   * @param shortcodes
   */
  public static async init(shortcodes: string = "./shortcodes") {
    ShortcodesHelpers.reset();
    // console.log(`Initializing shortcodes from folder: ${shortcodes}`);

    let files: string[] = [];
    if (await existsAsync(shortcodes)) {
      files = await fg(`${shortcodes}/**/*.{js,cjs,mjs}`.replace(/\\/g, "/"));
    }

    Logger.debug(`Doctor found ${files.length} custom shortcodes`);

    // Load all the custom shortcodes
    if (files && files.length > 0) {
      for (const file of files) {
        const filePath = join(process.cwd(), file);
        const loadedModule = await import(pathToFileURL(filePath).href);
        const sc = loadedModule.default ?? loadedModule;
        if (sc && sc.name && sc.render) {
          const kind: ShortcodeKind = sc.kind ?? "inline";

          // An unknown kind falls back to "inline" if it isn't caught here,
          // which would silently render a control shortcode as HTML
          if (!SHORTCODE_KINDS.includes(kind)) {
            throw new Error(
              `Unknown kind "${sc.kind}" for shortcode "${sc.name}" in ${file}. Use ${SHORTCODE_KINDS.map((k) => `"${k}"`).join(" or ")}.`,
            );
          }

          ShortcodesHelpers.shortcodes[sc.name] = {
            kind,
            render: sc.render,
            beforeMarkdown: !!sc.beforeMarkdown,
          } as Shortcode[string];
        }
      }
    }
  }

  public static reset() {
    ShortcodesHelpers.shortcodes = { ...defaultShortcodes };
  }

  /**
   * Parse shortcodes before markdown was processed
   * @param htmlMarkup
   */
  public static async parseBefore(markdown: string): Promise<string> {
    return this.parse(markdown, true);
  }

  /**
   * Parse shortcodes after markdown was processed
   * @param htmlMarkup
   */
  public static async parseAfter(htmlMarkup: string): Promise<string> {
    return this.parse(htmlMarkup, false);
  }

  /**
   * Parse the markdown or HTML with the shortcodes
   * @param htmlMarkup
   */
  private static async parse(
    htmlMarkup: string,
    beforeMarkdown: boolean,
  ): Promise<string> {
    if (!ShortcodesHelpers.shortcodes) return htmlMarkup;

    let tags = Object.getOwnPropertyNames(ShortcodesHelpers.get());
    if (!tags || tags.length < 1) return htmlMarkup;

    for (const tag of tags) {
      if (typeof ShortcodesHelpers.shortcodes[tag].render !== "function") {
        throw new Error(`Missing render function for shortcode tag: "${tag}"`);
      }
    }

    // Control shortcodes are consumed by the segmentation pass, before the
    // markdown ever reaches here. Their render() returns a web part definition
    // rather than HTML, so letting one through would splice "[object Object]"
    // into the page.
    tags = tags.filter(
      (tag) =>
        !ShortcodesHelpers.isControl(tag) &&
        ShortcodesHelpers.shortcodes[tag].beforeMarkdown === beforeMarkdown,
    );

    Logger.debug(`Doctor uses ${tags.length} shortcodes for HTML parsing.`);

    // Shortcodes used as code samples should be shown as-is. Once markdown has
    // been processed, the code blocks are escaped, so they only need to be
    // masked while parsing the raw markdown.
    const codeSnippets: string[] = [];
    const content = beforeMarkdown
      ? ShortcodesHelpers.maskCode(htmlMarkup, codeSnippets)
      : htmlMarkup;

    const $ = cheerio.load(content, {
      xml: {
        xmlMode: true,
        decodeEntities: false,
      },
    });

    for (const tag of tags) {
      const elms = $(tag).toArray();
      Logger.debug(
        `Doctor found ${elms.length} element(s) for "${tag}" shortcode.`,
      );
      if (elms && elms.length > 0) {
        const shortcode = ShortcodesHelpers.shortcodes[
          tag
        ] as InlineShortcodeRender;

        let tocPostProcessing: string | null = null;
        for (const elm of elms) {
          if (elm && shortcode && shortcode.render) {
            Logger.debug(`Executing shortcode "${tag}"`);

            const $elm = $(elm);
            const attributes: any = this.getAllAttributes($elm.get(0));

            if (
              tag === "toc" &&
              attributes &&
              attributes.position &&
              (attributes.position.toLowerCase() === TocPosition.left ||
                attributes.position.toLowerCase() === TocPosition.right)
            ) {
              tocPostProcessing = attributes.position;
            }

            const scHtml = await shortcode.render(
              attributes,
              $elm.html() ?? "",
            );
            $elm.replaceWith(scHtml);

            Logger.debug(`Shortcode "${tag}" its HTML:`);
            Logger.debug(scHtml);
            Logger.debug(``);
          }
        }

        if (tocPostProcessing) {
          const $parent = $(".doctor__container");
          const $elm = $(".doctor__container__toc");
          if ($elm && $parent) {
            $elm.prependTo($parent);
            $parent
              .find(".doctor__container__markdown")
              .addClass(
                `doctor__container__markdown_${tocPostProcessing.toLowerCase()}_padding`,
              );
          }
        }
      }
    }

    Logger.debug(`The HTML after shortcode convertion`);
    Logger.debug($.html());
    Logger.debug(``);

    return ShortcodesHelpers.unmaskCode($.html(), codeSnippets);
  }

  /**
   * Replace the fenced and inline code blocks by placeholders, so that the
   * shortcodes which are used as code samples are not rendered. Shared with the
   * partials processing, which needs the same protection for its include tags.
   * @param markdown
   * @param snippets
   */
  public static maskCode(markdown: string, snippets: string[]): string {
    const toPlaceholder = (snippet: string) => {
      snippets.push(snippet);
      return `${CODE_PLACEHOLDER_PREFIX}${
        snippets.length - 1
      }${CODE_PLACEHOLDER_SUFFIX}`;
    };

    const lines = markdown.split("\n");
    const output: string[] = [];
    let fence: string | null = null;
    let block: string[] = [];

    for (const line of lines) {
      const fenceMatch = /^\s*(`{3,}|~{3,})\s*(\S*)/.exec(line);

      if (fence === null) {
        if (fenceMatch) {
          fence = fenceMatch[1];
          block = [line];
        } else {
          output.push(line);
        }
        continue;
      }

      block.push(line);

      // The closing fence uses the same character, is at least as long as the
      // opening one, and doesn't contain an info string
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        !fenceMatch[2]
      ) {
        output.push(toPlaceholder(block.join("\n")));
        fence = null;
        block = [];
      }
    }

    // An unclosed fence is code until the end of the document
    if (fence !== null) {
      output.push(toPlaceholder(block.join("\n")));
    }

    return output
      .join("\n")
      .replace(/(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g, (match) =>
        toPlaceholder(match),
      );
  }

  /**
   * Put the original code blocks back in place
   * @param htmlMarkup
   * @param snippets
   */
  public static unmaskCode(htmlMarkup: string, snippets: string[]): string {
    if (snippets.length === 0) {
      return htmlMarkup;
    }

    return htmlMarkup.replace(CODE_PLACEHOLDER_REGEX, (match, index) => {
      const snippet = snippets[Number(index)];
      return snippet === undefined ? match : snippet;
    });
  }

  /**
   * Get all attributes
   * @param $elm
   */
  public static getAllAttributes($elm: any) {
    const allAttr = {};

    if ($elm.attribs) {
      const names = Object.keys($elm.attribs);

      for (const name of names) {
        allAttr[`${name}`] = $elm.attribs[name];
      }
    }
    return allAttr;
  }

  /**
   * Retrieve all registered shortcodes
   */
  public static get() {
    return ShortcodesHelpers.shortcodes;
  }

  /**
   * Check whether a tag belongs to a shortcode that becomes its own SharePoint
   * control instead of HTML inside the Markdown web part
   * @param tag
   */
  public static isControl(tag: string): boolean {
    return ShortcodesHelpers.shortcodes[tag]?.kind === "control";
  }

  /**
   * The tags of every registered control shortcode, which is what the
   * segmentation pass looks for in the raw markdown
   */
  public static getControlTags(): string[] {
    return Object.getOwnPropertyNames(ShortcodesHelpers.shortcodes).filter(
      (tag) => ShortcodesHelpers.isControl(tag),
    );
  }

  /**
   * Retrieve a control shortcode by tag
   * @param tag
   */
  public static getControl(tag: string): ControlShortcodeRender | undefined {
    return ShortcodesHelpers.isControl(tag)
      ? (ShortcodesHelpers.shortcodes[tag] as ControlShortcodeRender)
      : undefined;
  }
}
