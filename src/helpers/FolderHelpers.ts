import { CliCommand, ArgumentsHelper, execScript, Logger } from "@helpers";

export class FolderHelpers {
  private static checkedFolders: string[] = [];

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
            let scriptData: any = await execScript(
              ArgumentsHelper.parse(
                `spo folder get --webUrl "${webUrl}" --folderUrl "${folderToProcess}" -o json`
              ),
              false
            );

            if (scriptData && typeof scriptData === "string") {
              scriptData = JSON.parse(scriptData);
            }

            if (!scriptData && !scriptData.Exists) {
              throw "Folder doesn't seem to exist yet";
            }
          } catch (e) {
            await execScript(
              ArgumentsHelper.parse(
                `spo folder add --webUrl "${webUrl}" --parentFolderUrl "/${crntFolder}" --name "${folder}"`
              ),
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
