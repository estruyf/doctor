import * as CleanCSS from "clean-css";
import * as fg from "fast-glob";
import md = require("markdown-it");
import hljs = require("highlight.js");
import { encode } from "html-entities";
import { CliCommand, ShortcodesHelpers, TempDataHelper } from "@helpers";
import { CommandArguments, MarkdownSettings } from "@models";

export class MarkdownHelper {
  /**
   * Fetched the Markdown files from the start folder
   * @param ctx
   * @param startFolder
   */
  public static async fetchMDFiles(ctx: any, startFolder: string) {
    const uniformalStartFolder = startFolder.replace(/\\/g, "/");
    const files = await fg(`${uniformalStartFolder}/**/*.md`, {
      ignore: [
        `${uniformalStartFolder}/**/*.lang.md`,
        `${uniformalStartFolder}/**/*.machinetranslated.md`,
      ],
    });

    if (files && files.length > 0) {
      ctx.files = files;
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
    const converter = md({
      html: true,
      breaks: true,
      highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs ${lang
              .toLowerCase()
              .replace(/ /g, "_")}"><code>${
              hljs.highlight(lang, str, true).value
            }</code></pre>`;
          } catch (__) {}
        }

        return `<pre class="hljs"><code>${
          hljs.highlightAuto(str).value
        }</code></pre>`;
      },
    })
      .use(require("markdown-it-anchor"), {
        permalink: true,
        permalinkClass: `toc-anchor`,
      })
      .use(require("markdown-it-table-of-contents"), {
        includeLevel: options.tocLevels,
      });

    const mdOptions = CliCommand.options.markdown;
    const theme =
      mdOptions && mdOptions.theme ? mdOptions.theme.toLowerCase() : "dark";

    const cleanCss = new CleanCSS({});
    let htmlMarkup = await ShortcodesHelpers.parseBefore(`
<div class="doctor__container">
<div class="doctor__container__markdown">
  ${markdown}
</div>
</div>`);
    htmlMarkup = converter.render(htmlMarkup);
    htmlMarkup = await ShortcodesHelpers.parseAfter(htmlMarkup);
    htmlMarkup = `${htmlMarkup}<style>${
      cleanCss.minify(this.getEditorStyles(theme === "light")).styles
    } ${cleanCss.minify(this.getShortcodeStyles()).styles}</style>`;

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

  /**
   * Retrieve the CSS styles for code highlighting
   * @param light
   */
  private static getEditorStyles(light: boolean = false) {
    if (light) {
      return `.hljs {
        display: block;
        overflow-x: auto;
        padding: 0.5em;
        color: #333;
        background: #f8f8f8;
      }
      
      .hljs-comment,
      .hljs-quote {
        color: #998;
        font-style: italic;
      }
      
      .hljs-keyword,
      .hljs-selector-tag,
      .hljs-subst {
        color: #333;
        font-weight: bold;
      }
      
      .hljs-number,
      .hljs-literal,
      .hljs-variable,
      .hljs-template-variable,
      .hljs-tag .hljs-attr {
        color: #008080;
      }
      
      .hljs-string,
      .hljs-doctag {
        color: #d14;
      }
      
      .hljs-title,
      .hljs-section,
      .hljs-selector-id {
        color: #900;
        font-weight: bold;
      }
      
      .hljs-subst {
        font-weight: normal;
      }
      
      .hljs-type,
      .hljs-class .hljs-title {
        color: #458;
        font-weight: bold;
      }
      
      .hljs-tag,
      .hljs-name,
      .hljs-attribute {
        color: #000080;
        font-weight: normal;
      }
      
      .hljs-regexp,
      .hljs-link {
        color: #009926;
      }
      
      .hljs-symbol,
      .hljs-bullet {
        color: #990073;
      }
      
      .hljs-built_in,
      .hljs-builtin-name {
        color: #0086b3;
      }
      
      .hljs-meta {
        color: #999;
        font-weight: bold;
      }
      
      .hljs-deletion {
        background: #fdd;
      }
      
      .hljs-addition {
        background: #dfd;
      }
      
      .hljs-emphasis {
        font-style: italic;
      }
      
      .hljs-strong {
        font-weight: bold;
      }`;
    }

    return `.hljs {
      display: block;
      overflow-x: auto;
      padding: 0.5em;
      background: #272822;
      color: #ddd;
    }
    
    .hljs-tag,
    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-literal,
    .hljs-strong,
    .hljs-name {
      color: #f92672;
    }
    
    .hljs-code {
      color: #66d9ef;
    }
    
    .hljs-class .hljs-title {
      color: white;
    }
    
    .hljs-attribute,
    .hljs-symbol,
    .hljs-regexp,
    .hljs-link {
      color: #bf79db;
    }
    
    .hljs-string,
    .hljs-bullet,
    .hljs-subst,
    .hljs-title,
    .hljs-section,
    .hljs-emphasis,
    .hljs-type,
    .hljs-built_in,
    .hljs-builtin-name,
    .hljs-selector-attr,
    .hljs-selector-pseudo,
    .hljs-addition,
    .hljs-variable,
    .hljs-template-tag,
    .hljs-template-variable {
      color: #a6e22e;
    }
    
    .hljs-comment,
    .hljs-quote,
    .hljs-deletion,
    .hljs-meta {
      color: #75715e;
    }
    
    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-literal,
    .hljs-doctag,
    .hljs-title,
    .hljs-section,
    .hljs-type,
    .hljs-selector-id {
      font-weight: bold;
    }`;
  }

  private static getShortcodeStyles() {
    return `
      .doctor__container {
        position: relative;
      }

      @media screen and (min-width: 1024px) {
        .doctor__container__markdown_right_padding {
          padding-right: 20%;
        }
  
        .doctor__container__toc_right {
          float: right;
          position: sticky;
          top: 0;
          width: 19%;
        }
      }

      .callout {
        padding: 1rem;
        border: 1px solid #eaeaea;
        border-radius: 15px;
      }

      .callout-content>:last-child {
        margin-bottom: 0;
      }

      .callout h5 {
        font-weight: bold;
        margin: 0 0 .5rem 0;
      }
      
      .callout .callout-icon svg {
        display: inline-block;
        vertical-align: middle;
        margin-right: .2em;
      }

      .callout-note { background-color: #e1dfdd; color: #000; }
      .callout-tip { background-color: #bad80a; color: #000; }
      .callout-info { background-color: #00b7c3; color: #000; }
      .callout-caution { background-color: #ffaa44; color: #000; }
      .callout-danger { background-color: #d13438; color: #000; }
    
      a.toc-anchor {
        display: none;
        text-decoration: none;
      }

      a.toc-anchor:hover {
        text-decoration: none;
      }

      h1:hover a.toc-anchor,
      h2:hover a.toc-anchor,
      h3:hover a.toc-anchor,
      h4:hover a.toc-anchor,
      h5:hover a.toc-anchor,
      h6:hover a.toc-anchor {
        display: inline;
      }
    `;
  }
}
