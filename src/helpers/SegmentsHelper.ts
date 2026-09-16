import * as cheerio from "cheerio";
import { PageSegment } from "@models";
import { ShortcodesHelpers } from "./ShortcodesHelpers.js";

const escapeForRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class SegmentsHelper {
  /**
   * Cut a Markdown document into the controls it should become.
   *
   * A control shortcode has to sit on a line of its own, unindented and without
   * a body, because it turns into a separate SharePoint web part rather than
   * HTML inside the Markdown one — there is nowhere for surrounding text or a
   * body to go. Anything else is an error instead of a silent inline render.
   *
   * Pure on purpose: it takes the control tags rather than reading the
   * shortcode registry, so it holds no state and is testable without a tenant.
   *
   * @param markdown the resolved page content, front matter already stripped
   * @param controlTags the tags of the registered control shortcodes
   */
  public static split(markdown: string, controlTags: string[]): PageSegment[] {
    const wholeDocument: PageSegment[] = [{ type: "markdown", content: markdown }];

    if (!markdown || !controlTags || controlTags.length === 0) {
      return wholeDocument;
    }

    // Shortcodes shown as a code sample are not real occurrences
    const snippets: string[] = [];
    const masked = ShortcodesHelpers.maskCode(markdown, snippets);

    const tags = controlTags.map(escapeForRegex).join("|");
    // `<tag />`, `<tag attr="value" />` or `<tag></tag>` — alone on its line.
    // Quoted attribute values are matched as a whole rather than as "anything
    // but >", so a value which contains one — a KQL query like `Size>1000`,
    // say — still reads as the tag it is instead of being reported as a
    // shortcode sitting mid-paragraph.
    // An unquoted value may hold a `/` — `path=/sites/docs` — so only a `/`
    // that closes the tag ends it
    const unquoted = `(?:[^\\s"'=<>/]|/(?!>))+`;
    const attributes = `(?:\\s+[^\\s=/>]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|${unquoted}))?)*`;
    const tagLine = new RegExp(
      `^<(${tags})(${attributes})\\s*(?:/>|>\\s*</\\1>)\\s*$`,
    );

    const segments: PageSegment[] = [];
    let buffer: string[] = [];

    const flushMarkdown = () => {
      const content = buffer.join("\n");
      buffer = [];

      if (!content.trim()) {
        return;
      }

      SegmentsHelper.assertNoControlTags(content, controlTags);
      segments.push({
        type: "markdown",
        content: ShortcodesHelpers.unmaskCode(content, snippets).trim(),
      });
    };

    for (const line of masked.split("\n")) {
      const match = tagLine.exec(line);

      if (match) {
        flushMarkdown();
        segments.push({
          type: "control",
          shortcode: match[1],
          attributes: SegmentsHelper.getAttributes(line, match[1], snippets),
        });
      } else {
        buffer.push(line);
      }
    }
    flushMarkdown();

    // Keep the untouched document for the overwhelming majority of pages, so
    // what reaches the Markdown web part is byte-for-byte what it gets today
    return segments.some((segment) => segment.type === "control")
      ? segments
      : wholeDocument;
  }

  /**
   * Whether any of the tags is used in the content, ignoring the occurrences
   * shown as a code sample
   * @param content
   * @param tagNames
   */
  public static hasTag(content: string, tagNames: string[]): boolean {
    if (!content || !tagNames || tagNames.length === 0) {
      return false;
    }

    const tags = tagNames.map(escapeForRegex).join("|");
    return new RegExp(`</?(${tags})(?=[\\s/>])`).test(
      ShortcodesHelpers.maskCode(content, []),
    );
  }

  /**
   * A control shortcode anywhere other than on its own line — indented, in a
   * list item or blockquote, mid-paragraph, or wrapped around a body — cannot
   * become a web part, so it has to fail loudly rather than reach the inline
   * shortcode parser.
   */
  private static assertNoControlTags(content: string, controlTags: string[]) {
    const tags = controlTags.map(escapeForRegex).join("|");
    const stray = new RegExp(`</?(${tags})(?=[\\s/>])`).exec(content);

    if (stray) {
      throw new Error(
        `The "${stray[1]}" control shortcode has to be on a line of its own, unindented and without a body (for example: <${stray[1]} />). It becomes a separate SharePoint web part, so it cannot sit inside a paragraph, list, blockquote or table.`,
      );
    }
  }

  /**
   * Read the attributes off a control shortcode tag the same way the inline
   * shortcodes do, so quoting behaves identically
   */
  private static getAttributes(
    line: string,
    tag: string,
    snippets: string[],
  ): { [name: string]: string } {
    const $ = cheerio.load(line, {
      xml: {
        xmlMode: true,
        decodeEntities: false,
      },
    });

    const attributes: { [name: string]: string } =
      ShortcodesHelpers.getAllAttributes($(tag).get(0));

    // An attribute value may hold inline code, which was masked before splitting
    for (const name of Object.keys(attributes)) {
      attributes[name] = ShortcodesHelpers.unmaskCode(
        attributes[name],
        snippets,
      );
    }

    return attributes;
  }
}
