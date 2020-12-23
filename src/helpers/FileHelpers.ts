import { ArgumentsHelper } from './ArgumentsHelper';
import * as path from 'path';
import { execScript } from "./execScript";
import { CommandArguments } from '../models/CommandArguments';
import { Logger } from './logger';
import { File } from '../models/File';
import { Folder } from '../models/Folder';

export class FileHelpers {
  private static checkedFiles: string[] = [];

  /**
   * Retrieve the relative path for the file
   * @param webUrl 
   * @param library 
   * @param filePath 
   */
  public static getRelUrl(webUrl: string, filePath: string) {
    const relWebUrl = webUrl.split('sharepoint.com').pop();
    return `${ relWebUrl.startsWith('/') ? '' : '/' }${ relWebUrl }${ relWebUrl.endsWith('/') ? '' : '/' }${filePath}`;
  }
  
  /**
   * Create the file on SharePoint
   * @param crntFolder 
   * @param imgPath 
   * @param webUrl 
   * @param override 
   */
  public static async create(crntFolder: string, imgPath: string, webUrl: string, override: boolean = false) {
    if (this.checkedFiles.indexOf(imgPath) === -1) {
      if (override) {
        await this.upload(webUrl, crntFolder, imgPath);
      } else {
        try {
          // Check if file exists
          const filePath = `${crntFolder}/${path.basename(imgPath)}`;
          const relativeUrl = this.getRelUrl(webUrl, filePath);
          await execScript(`localm365`, ArgumentsHelper.parse(`spo file get --webUrl "${webUrl}" --url "${relativeUrl}"`));
        } catch (e) {
          await this.upload(webUrl, crntFolder, imgPath);
        }
      }
    
      this.checkedFiles.push(imgPath);
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
        let filesData: File[] | string =  await execScript<string>(`localm365`, ArgumentsHelper.parse(`spo file list --webUrl "${webUrl}" -f "${crntFolder}" -o json`));
        if (filesData && typeof filesData === "string") {
          filesData = JSON.parse(filesData);
        }

        Logger.debug(`Files to be removed: ${JSON.stringify(filesData)}`);

        for (const file of filesData as File[]) {
          if (file && file.UniqueId) {
            const filePath = `${crntFolder}${file.ServerRelativeUrl.toLowerCase().split(crntFolder).pop()}`;
            await execScript<string>(`localm365`, ArgumentsHelper.parse(`spo file remove --webUrl "${webUrl}" --url "${filePath}" --confirm`));
          }
        }

        let folderData: Folder[] | string =  await execScript<string>(`localm365`, ArgumentsHelper.parse(`spo folder list --webUrl "${webUrl}" --parentFolderUrl "${crntFolder}" -o json`));
        if (folderData && typeof folderData === "string") {
          folderData = JSON.parse(folderData);
        }

        Logger.debug(`Folders to be removed: ${JSON.stringify(folderData)}`);
        
        for (const folder of folderData as Folder[]) {
          if (folder && folder.Exists && folder.Name.toLowerCase() !== "forms") {
            const folderPath = `${crntFolder}${folder.ServerRelativeUrl.toLowerCase().split(crntFolder).pop()}`;
            await execScript<string>(`localm365`, ArgumentsHelper.parse(`spo folder remove --webUrl "${webUrl}" --folderUrl "${folderPath}" --confirm`));
          }
        }
      } catch (e) {
        throw e.message;
      }
    }
  }

  /**
   * Upload the file
   * @param webUrl 
   * @param crntFolder 
   * @param imgPath 
   */
  private static async upload(webUrl: string, crntFolder: string, imgPath: string) {
    await execScript(`localm365`, ArgumentsHelper.parse(`spo file add --webUrl "${webUrl}" --folder "${crntFolder}" --path "${imgPath}"`));
  }
}