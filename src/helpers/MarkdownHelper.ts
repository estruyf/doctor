
import md = require('markdown-it');
import hljs = require('highlight.js');
import { MarkdownSettings } from '../models';
import { ShortcodesHelpers } from './ShortcodesHelpers';
import { encode } from 'html-entities';
import { TempDataHelper } from './TempDataHelper';
import * as CleanCSS from 'clean-css';

export class MarkdownHelper {

  /**
   * Retrieve the JSON data for the web part
   * @param webPartTitle 
   * @param markdown 
   */
  public static async getJsonData(webPartTitle: string, markdown: string, mdOptions: MarkdownSettings | null): Promise<string> {
    const converter = md({ html: true, breaks: true, highlight: (str, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(lang, str, true).value}</code></pre>`;
        } catch (__) {}
      }

      return `<pre class="hljs"><code>${hljs.highlightAuto(str).value}</code></pre>`;
    }})
    .use(require("markdown-it-anchor"), { permalink: true, permalinkClass: `toc-anchor` })
    .use(require("markdown-it-table-of-contents"), { includeLevel: [1,2,3,4] });

    const allowHtml = mdOptions && mdOptions.allowHtml;
    const theme = mdOptions && mdOptions.theme ? mdOptions.theme.toLowerCase() : "dark";

    let wpData = {
      title: webPartTitle,
      serverProcessedContent: {
        searchablePlainTexts: {
          code: encode(markdown)
        }
      },
      dataVersion: "2.0",
      properties: {
        displayPreview: true,
        lineWrapping: true,
        miniMap: {
          enabled: false
        },
        previewState: "Show",
        theme: theme === "dark" ? "Monokai" : "Base16Light"
      }
    }

    if (allowHtml) {
      const cleanCss = new CleanCSS({});
      let htmlMarkup = await ShortcodesHelpers.parse(markdown);
      htmlMarkup = converter.render(htmlMarkup);
      htmlMarkup = `${htmlMarkup}<style>${cleanCss.minify(this.getEditorStyles(theme === "light")).styles} ${cleanCss.minify(this.getShortcodeStyles()).styles}</style>`;

      if (htmlMarkup) {
        wpData.serverProcessedContent["htmlStrings"] = {
          html: htmlMarkup
        }
      }
    }

    return TempDataHelper.create(wpData);
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