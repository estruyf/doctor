import { join } from "path";
import { CommandArguments } from "@models";
import { existsAsync, mkdirAsync, writeFileAsync } from "@utils";

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
    const indexFile = join(startFolder, "index.md");
    const configFile = join(crntFolder, "doctor.json");

    // Create the initial folder and files
    if (!(await existsAsync(startFolder))) {
      await mkdirAsync(startFolder, { recursive: true });
    }

    if (!(await existsAsync(indexFile))) {
      await writeFileAsync(indexFile, this.fileContents, { encoding: "utf-8" });
    }

    if (!(await existsAsync(configFile))) {
      const jsonContents = JSON.stringify(
        {
          $schema:
            "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/1.2.0.json",
          auth: options.auth,
          username: options.username,
          password: options.password,
          url: options.webUrl,
          folder: options.startFolder.replace(process.cwd(), "."),
          overwriteImages: options.overwriteImages,
          library: options.assetLibrary,
          webPartTitle: options.webPartTitle,
        },
        null,
        2
      );
      await writeFileAsync(configFile, jsonContents, { encoding: "utf-8" });
    }
  }
}
