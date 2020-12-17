import * as fs from "fs";
import kleur = require("kleur");
import * as path from "path";

export class Version {

  /**
   * Retrieve the version number
   */
  public static start() {
    const version = this.getVersion();
    if (version) {
      console.log(`Current installed version: ${version}`);
    } else {
      console.log(kleur.red('Unknown version!'));
    }
  }

  /**
   * Retrieve the current version
   */
  public static getVersion() {
    const pkg = fs.readFileSync(path.join(__dirname, '../../package.json'), { encoding: 'utf-8' });
    if (pkg) {
      const parsed = JSON.parse(pkg);
      return parsed.version;
    }
    return null;
  }
}