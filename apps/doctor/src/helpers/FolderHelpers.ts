import { CliCommand, executeWithRetry, Logger } from "@helpers";
import { executeCommand } from "@pnp/cli-microsoft365";

export class FolderHelpers {
  private static checkedFolders: string[] = [];

  public static reset() {
    FolderHelpers.checkedFolders = [];
  }

  /**
   * Create new folders
   * @param crntFolder
   * @param folders
   * @param webUrl
   */
  public static async create(
    crntFolder: string,
    folders: string[],
    webUrl: string
  ) {
    for (const folder of folders) {
      // Check if folder exists
      const folderToProcess = `/${crntFolder}/${folder}`;
      if (folder) {
        Logger.debug(`Folder: ${folder} - Folder path: ${folderToProcess}`);

        if (this.checkedFolders.indexOf(folderToProcess) === -1) {
          try {
            const { stdout } = await executeCommand("spo folder get", {
              webUrl,
              url: folderToProcess,
              output: "json",
            });
            let scriptData: any = stdout;

            if (scriptData && typeof scriptData === "string") {
              scriptData = JSON.parse(scriptData);
            }

            if (!scriptData && !scriptData.Exists) {
              throw "Folder doesn't seem to exist yet";
            }
          } catch (e) {
            await FolderHelpers.add(webUrl, `/${crntFolder}`, folder);
          }

          this.checkedFolders.push(folderToProcess);
        }

        crntFolder = `${crntFolder}/${folder}`;
      }
    }

    return crntFolder;
  }

  /**
   * Create a folder, and accept it when it is already there.
   *
   * SharePoint words the "already exists" error in the language of the site, so
   * matching on its text fails on a site that is not in English (#210). When the
   * add fails, the folder is looked up instead: when it is there, the add had
   * nothing to do, otherwise the error of the add is the one that counts.
   * @param webUrl
   * @param parentFolderUrl
   * @param name
   */
  public static async add(
    webUrl: string,
    parentFolderUrl: string,
    name: string
  ): Promise<void> {
    try {
      await executeWithRetry(
        "spo folder add",
        { webUrl, parentFolderUrl, name },
        CliCommand.getRetry()
      );
    } catch (addError) {
      const folderUrl = `${parentFolderUrl.replace(/\/+$/, "")}/${name}`;
      try {
        await executeWithRetry(
          "spo folder get",
          { webUrl, url: folderUrl, output: "json" },
          false
        );
      } catch {
        throw addError;
      }

      Logger.debug(`Folder ${folderUrl} already exists.`);
    }
  }
}
