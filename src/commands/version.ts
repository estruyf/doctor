import kleur = require("kleur");
import { join } from "path";
import { readFileAsync } from "@utils";

export class Version {
  /**
   * Retrieve the version number
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
   * Retrieve the current version
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
