import CleanCSS from "clean-css";
import fg from "fast-glob";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItTableOfContents from "markdown-it-table-of-contents";
import { full as markdownItEmoji } from "markdown-it-emoji";
import markdownItMark from "markdown-it-mark";
import markdownItFootnote from "markdown-it-footnote";
import markdownItDeflist from "markdown-it-deflist";
import markdownItTaskLists from "markdown-it-task-lists";
import { CliCommand, ShortcodesHelpers, TempDataHelper } from "@helpers";
import { CommandArguments, MarkdownSettings, PublishContext, TaskOutput } from "@models";
import hljs from "highlight.js";
import { encode } from "html-entities";
import { dirname, relative } from "path";
import { hljsDarkCss } from "../styles/hljs-dark.js";
import { hljsLightCss } from "../styles/hljs-light.js";
import { shortcodesCss } from "../styles/shortcodes.js";
import { extendedCss } from "../styles/extended.js";

export class MarkdownHelper {
  /**
   * Fetched the Markdown files from the start folder
   * @param ctx
   * @param task
   * @param startFolder
   */
  public static async fetchMDFiles(
    ctx: PublishContext,
    task: TaskOutput,
    startFolder: string,
    ignore: string[] = []
  ) {
    const uniformalStartFolder = startFolder.replace(/\\/g, "/");
    const files = await fg(`${uniformalStartFolder}/**/*.md`, {
      ignore: [
        `${uniformalStartFolder}/**/*.lang.md`,
        `${uniformalStartFolder}/**/*.machinetranslated.md`,
        ...ignore,
      ],
    });

    if (files && files.length > 0) {
      ctx.files = files;

      // Group files by top-level folder for a concise summary output
      const folderCounts = new Map<string, number>();
      for (const file of files) {
        const rel = relative(uniformalStartFolder, dirname(file)) || ".";
        const topLevel =
          rel === "." ? "." : rel.split("/").filter(Boolean)[0] || ".";
        folderCounts.set(topLevel, (folderCounts.get(topLevel) ?? 0) + 1);
      }

      const folderLines = [...folderCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([folder, count]) =>
          folder === "."
            ? `  ./ (${count} ${count === 1 ? "file" : "files"})`
            : `  ./${folder}/ (${count} ${count === 1 ? "file" : "files"})`
        )
        .join("\n");

      task.output = `Found ${files.length} ${files.length === 1 ? "file" : "files"}:\n${folderLines}`;
    } else {
      return Promise.reject(
        new Error(`No markdown files found in the folder.`)
      );
    }
  }

  /**
   * Convert the markdown string to doctor HTML
   * @param markdown
   * @param options
   * @returns
   */
  public static async getHtmlData(markdown: string, options: CommandArguments) {
    const mdOptions = CliCommand.options?.markdown;
    const theme =
      mdOptions && mdOptions.theme ? mdOptions.theme.toLowerCase() : "dark";
    const useExtended = mdOptions?.extended !== false;

    const converter = new MarkdownIt({
      html: true,
      breaks: true,
      highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs ${lang
              .toLowerCase()
              .replace(/ /g, "_")}"><code>${
              hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
            }</code></pre>`;
          } catch (__) {}
        }

        return `<pre class="hljs"><code>${
          hljs.highlightAuto(str).value
        }</code></pre>`;
      },
    })
      .use(markdownItAnchor, {
        permalink: markdownItAnchor.permalink.ariaHidden({
          class: `toc-anchor`,
        }),
      })
      .use(markdownItTableOfContents, {
        includeLevel: options.tocLevels,
      });

    if (useExtended) {
      converter
        .use(markdownItEmoji)
        .use(markdownItMark)
        .use(markdownItFootnote)
        .use(markdownItDeflist)
        .use(markdownItTaskLists, { label: true });
    }

    const cleanCss = new CleanCSS({});
    // The blank lines around the markdown are required. Without them markdown-it
    // treats the opening `div` and the first block of the content as a single
    // HTML block, which leaves that first block unparsed.
    let htmlMarkup = await ShortcodesHelpers.parseBefore(`
<div class="doctor__container">
<div class="doctor__container__markdown">

${markdown}

</div>
</div>`);
    htmlMarkup = converter.render(htmlMarkup);
    htmlMarkup = await ShortcodesHelpers.parseAfter(htmlMarkup);

    const editorCss = theme === "light" ? hljsLightCss : hljsDarkCss;
    const additionalCss = useExtended
      ? ` ${cleanCss.minify(extendedCss).styles}`
      : ``;
    htmlMarkup = `${htmlMarkup}<style>${
      cleanCss.minify(editorCss).styles
    } ${cleanCss.minify(shortcodesCss).styles}${additionalCss}</style>`;

    return htmlMarkup;
  }

  /**
   * Retrieve the JSON data for the web part
   * @param webPartTitle
   * @param markdown
   */
  public static async getJsonData(
    webPartTitle: string,
    markdown: string,
    mdOptions: MarkdownSettings | null,
    options: CommandArguments,
    wasAlreadyParsed: boolean = false
  ): Promise<string> {
    const allowHtml = mdOptions && mdOptions.allowHtml;
    const theme =
      mdOptions && mdOptions.theme ? mdOptions.theme.toLowerCase() : "dark";

    let wpData = {
      title: webPartTitle,
      serverProcessedContent: {
        searchablePlainTexts: {
          code: encode(markdown),
        },
      },
      dataVersion: "2.0",
      properties: {
        displayPreview: true,
        lineWrapping: true,
        miniMap: {
          enabled: false,
        },
        previewState: "Show",
        theme: theme === "dark" ? "Monokai" : "Base16Light",
      },
    };

    if (allowHtml) {
      let htmlMarkup = wasAlreadyParsed
        ? markdown
        : await this.getHtmlData(markdown, options);

      if (htmlMarkup) {
        wpData.serverProcessedContent["htmlStrings"] = {
          html: htmlMarkup,
        };
      }
    }

    return await TempDataHelper.create(wpData);
  }

}
