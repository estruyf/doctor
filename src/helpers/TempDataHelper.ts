import * as fg from "fast-glob";
import { join } from "path";
import { Logger } from ".";
import { CliCommand } from "./CliCommand";
import { existsAsync, mkdirAsync, rmAsync, writeFileAsync } from "@utils";

export class TempDataHelper {
  /**
   * Create data in the temp folder
   * @param data
   */
  public static async create(data: any): Promise<string> {
    const crntFolder = process.cwd();
    const tempPath = join(crntFolder, "./temp");
    Logger.debug(`Creating temp data in folder: ${tempPath}`);
    if (!(await existsAsync(tempPath))) {
      await mkdirAsync(tempPath, { recursive: true });
    }

    const tempFilePath = join(tempPath, "./wpData.json");
    await writeFileAsync(tempFilePath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
    });
    return tempFilePath;
  }

  /**
   * Create a temp. page for multilingual
   * @param data
   * @returns
   */
  public static async createPage(
    originalPath: string,
    fileName: string,
    data: any
  ): Promise<string> {
    Logger.debug(`Creating temp page in folder: ${originalPath}`);

    if (!(await existsAsync(originalPath))) {
      await mkdirAsync(originalPath, { recursive: true });
    }

    const tempFilePath = join(
      originalPath,
      `./${fileName}.machinetranslated.md`
    );
    await writeFileAsync(tempFilePath, data, { encoding: "utf-8" });
    return tempFilePath;
  }

  /**
   * Clear the temp folder
   */
  public static async clear() {
    if (!CliCommand.options.debug) {
      const crntFolder = process.cwd();
      const tempPath = join(crntFolder, "./temp");
      if (await existsAsync(tempPath)) {
        await rmAsync(tempPath, { recursive: true });
      }

      const uniformalStartFolder = crntFolder.replace(/\\/g, "/");
      const files = await fg(
        `${uniformalStartFolder}/**/*.machinetranslated.md`
      );

      if (files && files.length > 0) {
        for (const file of files) {
          await rmAsync(file);
        }
      }
    }
  }
}
