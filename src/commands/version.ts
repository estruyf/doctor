import kleur from "kleur";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileAsync } from "@utils";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Version {
  /**
  * Prints the currently installed Doctor version to stdout.
  * @returns A promise that resolves after the version message is printed.
   */
  public static async start() {
    const version = await this.getVersion();
    if (version) {
      console.log(`Current installed version: ${version}`);
    } else {
      console.log(kleur.red("Unknown version!"));
    }
  }

  /**
   * Reads and returns the package version from package.json.
   * @returns A promise that resolves to the version string, or null when it cannot be determined.
   */
  public static async getVersion() {
    const pkg = await readFileAsync(join(__dirname, "../../package.json"), {
      encoding: "utf-8",
    });
    if (pkg) {
      const parsed = JSON.parse(pkg);
      return parsed.version;
    }
    return null;
  }
}
