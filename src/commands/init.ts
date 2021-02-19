
import * as fs from 'fs';
import * as path from 'path';
import { CommandArguments } from "../models/CommandArguments";


export class Init {
  private static fileContents: string = `---
  title: Index
  slug: index.aspx
  ---
  
  # Heading 1

  ## Heading 2
  
  Paragraph`;

  /**
   * Starts the project creation process
   * @param options 
   */
  public static async start(options: CommandArguments) {
    const { startFolder } = options;
    const crntFolder = process.cwd();
    const indexFile = path.join(startFolder, "index.md");
    const configFile = path.join(crntFolder, "doctor.json");

    // Create the initial folder and files
    if (!fs.existsSync(startFolder)) {
      fs.mkdirSync(startFolder, { recursive: true });
    }

    if (!fs.existsSync(indexFile)) {
      fs.writeFileSync(indexFile, this.fileContents, { encoding: "utf-8" });
    }

    if (!fs.existsSync(configFile)) {
      const jsonContents = JSON.stringify({
        "$schema": "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/1.0.0.json",
        auth: options.auth,
        username: options.username,
        password: options.password,
        url: options.webUrl,
        folder: options.startFolder.replace(process.cwd(), '.'),
        overwriteImages: options.overwriteImages,
        library: options.assetLibrary,
        wpInternalTitle: options.webPartTitle
      }, null, 2);
      fs.writeFileSync(configFile, jsonContents, { encoding: "utf-8" });
    }
  }
}