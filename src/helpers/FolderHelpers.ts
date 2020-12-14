import { execScript } from "./execScript";


export class FolderHelpers {
  private static checkedFolders: string[] = [];

  public static async create(crntFolder: string, folders: string[], webUrl: string) {
    for (const folder of folders) {
      // Check if folder exists
      const folderToProcess = `/${crntFolder}/${folder}`
      if (folder) {
        if (this.checkedFolders.indexOf(folderToProcess) === -1) {
          try {
            const scriptData: any = await execScript(`localm365`, [`spo`, `folder`, `get`, `--webUrl`, `'${webUrl}'`, `--folderUrl`, `'${folderToProcess}'`, `-o`, `json`, `|`, `jq`]);

            if (!scriptData && !scriptData.Exists) {
              throw "Folder doesn't seem to exist yet";
            }
          } catch (e) {
            await execScript(`localm365`, [`spo`, `folder`, `add`, `--webUrl`, `'${webUrl}'`, `--parentFolderUrl`, `'/${crntFolder}'`, `--name`, `'${folder}'`]);
          }
          
          this.checkedFolders.push(folderToProcess);
        }
        
        crntFolder = `${crntFolder}/${folder}`
      }
    }
    
    return crntFolder;
  }
}