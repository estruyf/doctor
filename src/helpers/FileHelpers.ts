import { CommandArguments, File, Folder } from "@models";
import {
  executeWithRetry,
  CliCommand,
  ListHelpers,
  Logger,
} from "@helpers";
import { basename } from "path";
import { executeCommand } from "@pnp/cli-microsoft365";

export class FileHelpers {
  private static allPages: File[] = [];
  private static checkedFiles: string[] = [];

  public static reset() {
    FileHelpers.allPages = [];
    FileHelpers.checkedFiles = [];
  }

  /**
   * Retrieve the relative path for the file
   * @param webUrl
   * @param library
   * @param filePath
   */
  public static getRelUrl(webUrl: string, filePath: string) {
    const relWebUrl = webUrl.split("sharepoint.com").pop() || "";
    return `${relWebUrl.startsWith("/") ? "" : "/"}${relWebUrl}${
      relWebUrl.endsWith("/") ? "" : "/"
    }${filePath}`;
  }

  /**
   * Create the file on SharePoint
   * @param crntFolder
   * @param imgPath
   * @param webUrl
   * @param override
   */
  public static async create(
    crntFolder: string,
    imgPath: string,
    webUrl: string,
    override: boolean = false
  ) {
    Logger.debug(`Create file "${imgPath}" to "${crntFolder}"`);
    const cacheKey = `${imgPath.replace(/ /g, "%20")}-${crntFolder.replace(
      / /g,
      "%20"
    )}`;
    if (this.checkedFiles && this.checkedFiles.indexOf(cacheKey) === -1) {
      if (override) {
        await this.upload(webUrl, crntFolder, imgPath);
      } else {
        try {
          // Check if file exists
          const filePath = `${crntFolder}/${basename(imgPath)}`;
          const relativeUrl = this.getRelUrl(webUrl, filePath);
          const fileData = await executeCommand("spo file get", {
            webUrl,
            url: relativeUrl,
          });
          Logger.debug(`File data retrieved: ${JSON.stringify(fileData)}`);
        } catch (e) {
          await this.upload(webUrl, crntFolder, imgPath);
        }
      }

      this.checkedFiles.push(cacheKey);
    }

    return `${webUrl}/${crntFolder}/${basename(imgPath)}`.replace(/ /g, "%20");
  }

  /**
   * Clean up all files in the folder
   * @param options
   */
  public static async cleanUp(options: CommandArguments, crntFolder: string) {
    if (options.cleanStart) {
      try {
        const { webUrl } = options;
        const { stdout: filesOutput } = await executeWithRetry(
          "spo file list",
          {
            webUrl,
            folderUrl: crntFolder,
            output: "json",
          },
          CliCommand.getRetry()
        );
        let filesData: File[] | string = filesOutput;
        if (filesData && typeof filesData === "string") {
          filesData = JSON.parse(filesData);
        }

        Logger.debug(`Files to be removed: ${JSON.stringify(filesData)}`);

        for (const file of filesData as File[]) {
          if (file && file.ServerRelativeUrl) {
            const filePath = `${crntFolder}${file.ServerRelativeUrl.toLowerCase()
              .split(crntFolder)
              .pop()}`;
            await executeWithRetry(
              "spo file remove",
              {
                webUrl,
                url: filePath,
                force: true,
              },
              CliCommand.getRetry()
            );
          }
        }

        const { stdout: foldersOutput } = await executeWithRetry(
          "spo folder list",
          {
            webUrl,
            parentFolderUrl: crntFolder,
            output: "json",
          },
          CliCommand.getRetry()
        );
        let folderData: Folder[] | string = foldersOutput;
        if (folderData && typeof folderData === "string") {
          folderData = JSON.parse(folderData);
        }

        Logger.debug(`Folders to be removed: ${JSON.stringify(folderData)}`);

        for (const folder of folderData as Folder[]) {
          if (
            folder &&
            folder.Exists &&
            folder.Name.toLowerCase() !== "forms" &&
            folder.Name.toLowerCase() !== "templates"
          ) {
            const folderPath = `${crntFolder}${folder.ServerRelativeUrl.toLowerCase()
              .split(crntFolder)
              .pop()}`;
            await executeWithRetry(
              "spo folder remove",
              {
                webUrl,
                url: folderPath,
                force: true,
              },
              CliCommand.getRetry()
            );
          }
        }
      } catch (e) {
        const errorMessage =
          typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
        throw new Error(errorMessage);
      }
    }
  }

  /**
   * Retrieve all pages
   * @param webUrl
   * @param crntFolder
   */
  public static async getAllPages(
    webUrl: string,
    crntFolder: string
  ): Promise<File[]> {
    if (this.allPages && this.allPages.length > 0) {
      Logger.debug(`Using cached pages data for site: ${webUrl}`);

      return this.allPages;
    }

    Logger.debug(`Retrieving site pages library for site: ${webUrl}`);

    const pageList = await ListHelpers.getSitePagesList(webUrl);

    Logger.debug(`Retrieving all the existing pages from the site: ${webUrl}`);

    const { stdout } = await executeWithRetry(
      "spo listitem list",
      {
        webUrl,
        listId: pageList.Id,
        fields: "ID,Title,FileRef",
        output: "json",
      },
      CliCommand.getRetry()
    );
    let filesData: File[] | string = stdout;
    if (filesData && typeof filesData === "string") {
      filesData = JSON.parse(filesData);
    }

    this.allPages = filesData as File[];
    return this.allPages;
  }

  /**
   * Upload the file
   * @param webUrl
   * @param crntFolder
   * @param imgPath
   */
  private static async upload(
    webUrl: string,
    crntFolder: string,
    imgPath: string
  ) {
    Logger.debug(`Uploading file "${imgPath}" to ${crntFolder}"`);
    await executeWithRetry(
      "spo file add",
      {
        webUrl,
        folder: crntFolder,
        path: imgPath,
      },
      CliCommand.getRetry()
    );
  }
}
