import { CliCommand, executeWithRetry, Logger } from "@helpers";
import { ListData } from "@models";

export class ListHelpers {
  private static pageList: ListData | null = null;

  public static reset() {
    ListHelpers.pageList = null;
  }

  /**
   * Retrieve the site pages library
   * @param webUrl
   */
  public static async getSitePagesList(webUrl: string) {
    Logger.debug(`Retrieving site pages library for site: ${webUrl}`);  

    if (!this.pageList) {
      const { stdout } = await executeWithRetry(
        "spo list list",
        {
          webUrl,
          output: "json",
        },
        CliCommand.getRetry()
      );

      Logger.debug(`Site pages library retrieved for site: ${webUrl}`);

      let listData: any = stdout;
      if (listData && typeof listData === "string") {
        listData = JSON.parse(listData);
      }

      this.pageList = (listData as ListData[]).find((list) => {
        const listUrl = (
          list?.Url ||
          list?.RootFolder?.ServerRelativeUrl ||
          list?.RootFolder?.Name ||
          list?.Title ||
          ""
        ).toLowerCase();

        return (
          listUrl.includes("/sitepages") ||
          listUrl.includes("site pages") ||
          listUrl.endsWith("sitepages")
        );
      }) ?? null;

      if (!this.pageList) {
        throw new Error("Unable to locate the Site Pages library from the SharePoint list response.");
      }

      Logger.debug(
        `Resolved Site Pages library: ${JSON.stringify({
          id: this.pageList.Id,
          title: this.pageList.Title,
          url:
            this.pageList.Url || this.pageList.RootFolder?.ServerRelativeUrl || null,
        })}`
      );
    }

    return this.pageList;
  }
}
