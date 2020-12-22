import { ArgumentsHelper } from './ArgumentsHelper';
import * as path from 'path';
import { execScript } from "./execScript";


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
   * Upload the file
   * @param webUrl 
   * @param crntFolder 
   * @param imgPath 
   */
  private static async upload(webUrl: string, crntFolder: string, imgPath: string) {
    await execScript(`localm365`, ArgumentsHelper.parse(`spo file add --webUrl "${webUrl}" --folder "${crntFolder}" --path "${imgPath}"`));
  }
}