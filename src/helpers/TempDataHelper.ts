import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '.';

export class TempDataHelper {

  /**
   * Create data in the temp folder
   * @param data 
   */
  public static create(data: any): string {
    const crntFolder = process.cwd();
    const tempPath = path.join(crntFolder, "./temp");
    Logger.debug(`Creating temp data in folder: ${tempPath}`);
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }

    const tempFilePath = path.join(tempPath, "./wpData.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2), { encoding: "utf-8" });
    return tempFilePath;
  }

  /**
   * Clear the temp folder
   */
  public static clear() {
    const crntFolder = process.cwd();
    const tempPath = path.join(crntFolder, "./temp");
    if (fs.existsSync(tempPath)) {
      fs.rmdirSync(tempPath, { recursive: true });
    }
  }
}