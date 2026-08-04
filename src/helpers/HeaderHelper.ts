import { join, dirname, basename } from "path";
import { CommandArguments, HeaderOptions } from "@models";
import {
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  Logger,
} from "@helpers";

export class HeaderHelper {
  /**
   * Set the page header based on the settings in the page's front matter
   * @param filePath
   * @param webUrl
   * @param slug
   * @param header
   * @param options
   */
  public static async set(
    filePath: string,
    webUrl: string,
    slug: string,
    header: HeaderOptions | undefined,
    options: CommandArguments,
    isCopy: boolean = false
  ) {
    const { assetLibrary, startFolder, overwriteImages } = options;

    Logger.debug(`Setting the page header for ${slug}`);

    const headerOptions: any = {
      webUrl,
      pageName: slug,
    };
    let hasHeaderUpdates = false;

    if (header) {
      if (header.type) {
        headerOptions.type = header.type;
        hasHeaderUpdates = true;
      }

      if (header.image) {
        const imgDirectory = join(dirname(filePath), dirname(header.image));
        const imgPath = join(dirname(filePath), header.image);

        const uniStartPath = startFolder.replace(/\\/g, "/");
        const folders = imgDirectory
          .replace(/\\/g, "/")
          .replace(uniStartPath, "")
          .split("/");
        let crntFolder = assetLibrary;

        // Start folder creation process
        crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);
        await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);

        const imgUrl = FileHelpers.getRelUrl(
          webUrl,
          `${crntFolder}/${basename(header.image)}`
        );
        headerOptions.imageUrl = imgUrl;
        hasHeaderUpdates = true;

        if (header.altText) {
          headerOptions.altText = header.altText;
          hasHeaderUpdates = true;
        }

        if (typeof header.translateX !== "undefined") {
          headerOptions.translateX = header.translateX;
          hasHeaderUpdates = true;
        }

        if (typeof header.translateY !== "undefined") {
          headerOptions.translateY = header.translateY;
          hasHeaderUpdates = true;
        }
      }

      if (header.layout) {
        headerOptions.layout = header.layout;
        hasHeaderUpdates = true;
      }

      if (header.textAlignment) {
        headerOptions.textAlignment = header.textAlignment;
        hasHeaderUpdates = true;
      }

      if (header.showTopicHeader) {
        headerOptions.showTopicHeader = true;
        hasHeaderUpdates = true;
      }

      if (header.topicHeader) {
        headerOptions.topicHeader = header.topicHeader;
        hasHeaderUpdates = true;
      }

      if (header.showPublishDate) {
        headerOptions.showPublishDate = true;
        hasHeaderUpdates = true;
      }

      if (header.authors) {
        headerOptions.authors = header.authors.join(",");
        hasHeaderUpdates = true;
      }
    }

    if (header || (!header && !isCopy)) {
      // Check if header is changed
      if (!hasHeaderUpdates) {
        return;
      }
      await executeWithRetry(
        "spo page header set",
        headerOptions,
        CliCommand.getRetry()
      );
    }
  }
}
