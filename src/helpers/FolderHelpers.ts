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
            await executeWithRetry(
              "spo folder add",
              {
                webUrl,
                parentFolderUrl: `/${crntFolder}`,
                name: folder,
              },
              CliCommand.getRetry()
            );
          }

          this.checkedFolders.push(folderToProcess);
        }

        crntFolder = `${crntFolder}/${folder}`;
      }
    }

    return crntFolder;
  }
}
