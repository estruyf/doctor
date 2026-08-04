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
   * Initializes a Doctor project in the current working context.
   * Creates the start folder, default index page, and doctor config file when missing.
   * @param options Command options used to derive file paths and initial config values.
   * @returns A promise that resolves when initialization steps are complete.
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
      const config: Record<string, unknown> = {
        $schema:
          "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.0.0.json",
        auth: options.auth,
        url: options.webUrl,
        folder: options.startFolder.replace(process.cwd(), "."),
        overwriteImages: options.overwriteImages,
        library: options.assetLibrary,
        webPartTitle: options.webPartTitle,
      };

      // The app ID and tenant are identifiers, not secrets, so they are safe to
      // store. The certificate and its password are deliberately left out.
      if (options.appId) {
        config.appId = options.appId;
      }

      if (options.tenant) {
        config.tenant = options.tenant;
      }

      const jsonContents = JSON.stringify(config, null, 2);
      await writeFileAsync(configFile, jsonContents, { encoding: "utf-8" });
    }
  }
}
