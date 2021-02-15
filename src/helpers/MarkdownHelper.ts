import { Remarkable } from 'remarkable';
import { encode } from 'html-entities';
import * as codemirror from 'codemirror/addon/runmode/runmode.node';

export class MarkdownHelper {

  /**
   * Retrieve the JSON data for the web part
   * @param webPartTitle 
   * @param markdown 
   */
  public static getJsonData(webPartTitle: string, markdown: string): string {
    const converter = new Remarkable({ html: true, breaks: true, highlight: function (str, lang) {
      var html = "<pre class=\"cm-s-default\">\n";
      const outf = function(token, tokenClass) {
        html = html + "<span class=\"pm-" + tokenClass + "\">" + token + "</span>\n"
      }
      codemirror.runMode(str, lang, outf);
      html = html + "</pre>\n";
      // https://nextjournal.com/kommen/codemirror-nodejs-runmode-for-syntax-highlighting
      console.log(``)
      console.log(``)
      console.log(lang)
      console.log(html)
      return html;
    } });
    const tilePh = `WEBPARTTITLE-PLACEHOLDER`;
    const markdownPh = `MARKDOWN-PLACEHOLDER`;
    const htmlPh = `HTML-PLACEHOLDER`;
    let wpData = `'{"title":"${tilePh}","serverProcessedContent": {"htmlStrings": { "html": "${htmlPh}" },"searchablePlainTexts": {"code": "${markdownPh}"}},"dataVersion": "2.0","properties": {"displayPreview": true,"lineWrapping": true,"miniMap": {"enabled": false},"previewState": "Show","theme": "Monokai"}}'`;

    // Update the quotes for Windows
    const isWIn = process.platform === "win32";
    if (isWIn) {
      wpData = wpData.replace(/\"/g, `""`).replace(/\'/g, `"`);
    }

    let htmlMarkup = converter.render(markdown);
    htmlMarkup = htmlMarkup.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\"/g, `\\\"`)
    markdown = this.parseMarkdown(markdown, isWIn);
    wpData = wpData.replace(tilePh, webPartTitle).replace(markdownPh, encode(markdown)).replace(htmlPh, htmlMarkup);
    return wpData;
  }

  /**
   * make the markdown ready for cross-platform publishing
   * @param markdown 
   * @param isWin 
   */
  private static parseMarkdown(markdown: string, isWin: boolean = false) {
    markdown = markdown.replace(/\r/g, '~r~').replace(/\n/g, '~n~');
    markdown = markdown.replace(/\\/g, `\\\\`);
    markdown = markdown.replace(/</g, `&lt;`);
    markdown = markdown.replace(/>/g, `&gt;`);
    markdown = markdown.replace(/~r~/g, '\\r').replace(/~n~/g, '\\n');
    if (isWin) {
      return markdown.replace(/\"/g, `&quot;`);
    }
    return markdown.replace(/"/g, `&quot;`);
  }
}