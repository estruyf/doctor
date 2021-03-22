import * as fs from 'fs';
import * as path from 'path';
import * as fg from 'fast-glob';
import { Logger } from '.';
import { CliCommand } from './CliCommand';

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
   * Create a temp. page for multilingual
   * @param data 
   * @returns 
   */
  public static createPage(originalPath: string, fileName: string, data: any): string {
    Logger.debug(`Creating temp page in folder: ${originalPath}`);
    
    if (!fs.existsSync(originalPath)) {
      fs.mkdirSync(originalPath, { recursive: true });
    }

    const tempFilePath = path.join(originalPath, `./${fileName}.machinetranslated.md`);
    fs.writeFileSync(tempFilePath, data, { encoding: "utf-8" });
    return tempFilePath;
  }

  /**
   * Clear the temp folder
   */
  public static async clear() {
    if (!CliCommand.options.debug) {
      const crntFolder = process.cwd();
      const tempPath = path.join(crntFolder, "./temp");
      if (fs.existsSync(tempPath)) {
        fs.rmdirSync(tempPath, { recursive: true });
      }

      const uniformalStartFolder = crntFolder.replace(/\\/g, '/');
      const files = await fg(`${uniformalStartFolder}/**/*.machinetranslated.md`);

      if (files && files.length > 0) {
        for (const file of files) {
          fs.rmSync(file);
        }
      }
    }
  }
}