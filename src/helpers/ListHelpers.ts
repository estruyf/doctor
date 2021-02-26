import { CliCommand } from ".";
import { ListData } from "../models/ListData";
import { ArgumentsHelper } from "./ArgumentsHelper";
import { execScript } from "./execScript";

export class ListHelpers {
  private static pageList: ListData = null;


  /**
   * Retrieve the site pages library
   * @param webUrl 
   */
  public static async getSitePagesList(webUrl: string) {
    if (!this.pageList) {
      let listData: any = await execScript(ArgumentsHelper.parse(`spo list list --webUrl "${webUrl}" --output json`), CliCommand.getRetry());
      if (listData && typeof listData === "string") {
        listData = JSON.parse(listData);
      }
      this.pageList = (listData as ListData[]).find(l => l.Url.toLowerCase().includes("/sitepages"));
    }
    return this.pageList;
  }
}