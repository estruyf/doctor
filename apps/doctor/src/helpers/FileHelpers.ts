import { CommandArguments, File, Folder } from "@models";
import {
  executeWithRetry,
  CliCommand,
  ListHelpers,
  Logger,
} from "@helpers";
import { basename } from "path";
import { DependencyHelper } from "./DependencyHelper.js";
import { StateHelper } from "./StateHelper.js";

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
   * Create the file on SharePoint.
   *
   * Without `override`, a file is uploaded when the library does not have it
   * yet, or when its contents differ from what the publish state says was
   * uploaded last. Going by the name alone kept the old image in the library
   * when it was edited, so its pages were republished and still showed it.
   * A file the state has no hash for — state written by an older version, or
   * a fresh one — is uploaded once, since nothing tells what the library holds.
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
      const filePath = `${crntFolder}/${basename(imgPath)}`;
      const hash = await this.getTrackedHash(imgPath);
      const recorded = hash ? StateHelper.getAssetHash(filePath) : null;

      if (override) {
        await this.upload(webUrl, crntFolder, imgPath);
      } else if (hash && recorded !== hash) {
        Logger.debug(
          recorded
            ? `File "${filePath}" changed since it was uploaded`
            : `No upload of "${filePath}" recorded in the publish state`
        );
        await this.upload(webUrl, crntFolder, imgPath);
      } else if (!(await this.exists(webUrl, filePath))) {
        await this.upload(webUrl, crntFolder, imgPath);
      }

      if (hash) {
        StateHelper.setAssetHash(filePath, hash);
      }

      this.checkedFiles.push(cacheKey);
    }

    return `${webUrl}/${crntFolder}/${basename(imgPath)}`.replace(/ /g, "%20");
  }

  /**
   * The hash of a local file, when uploads are tracked in the publish state.
   * A file that cannot be read gets none: it is then left to the library check
   * as before, instead of failing an upload that has nothing to send.
   */
  private static async getTrackedHash(path: string): Promise<string | null> {
    if (!StateHelper.tracksAssets()) {
      return null;
    }

    const hash = await DependencyHelper.hashFile(path);
    return hash === "missing" ? null : hash;
  }

  /**
   * Whether the library has a file at this path. Any failure counts as not
   * there, which uploads it; not retried, as a missing file is the usual reason.
   */
  private static async exists(webUrl: string, filePath: string) {
    try {
      const fileData = await executeWithRetry(
        "spo file get",
        {
          webUrl,
          url: this.getRelUrl(webUrl, filePath),
        },
        false
      );
      Logger.debug(`File data retrieved: ${JSON.stringify(fileData)}`);
      return true;
    } catch {
      return false;
    }
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
        // Set explicitly to avoid the CLI deprecation warning. Whether an
        // existing file may be replaced is already decided in `create`.
        overwrite: true,
      },
      CliCommand.getRetry()
    );
  }
}
