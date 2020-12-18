
export class MarkdownHelper {

  /**
   * Retrieve the JSON data for the web part
   * @param webPartTitle 
   * @param markdown 
   */
  public static getJsonData(webPartTitle: string, markdown: string): string {
    const tilePh = `WEBPARTTITLE-PLACEHOLDER`;
    const markdownPh = `MARKDOWN-PLACEHOLDER`;
    let wpData = `'{"title":"${tilePh}","serverProcessedContent": {"searchablePlainTexts": {"code": "${markdownPh}"}},"dataVersion": "2.0","properties": {"displayPreview": true,"lineWrapping": true,"miniMap": {"enabled": false},"previewState": "Show","theme": "Monokai"}}'`;

    // Update the quotes for Windows
    const isWIn = process.platform === "win32";
    if (isWIn) {
      wpData = wpData.replace(/\"/g, `""`).replace(/\'/g, `"`);
    }

    markdown = this.parseMarkdown(markdown, isWIn);

    wpData = wpData.replace(tilePh, webPartTitle).replace(markdownPh, markdown);
    return wpData;
  }

  /**
   * make the markdown ready for cross-platform publishing
   * @param markdown 
   * @param isWin 
   */
  private static parseMarkdown(markdown: string, isWin: boolean = false) {
    if (isWin) {
      return markdown.replace(/\r\n/g, '\\n').replace(/\"/g, `\\\\""`);
    }
    return markdown.replace(/\n/g, '\\n').replace(/"/g, `\\"`);
  }
}