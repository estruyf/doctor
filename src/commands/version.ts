import * as fs from "fs";
import * as path from "path";

export class Version {

  /**
   * Retrieve the version number
   */
  public static start() {
    const pkg = fs.readFileSync(path.join(__dirname, '../../package.json'), { encoding: 'utf-8' });
    if (pkg) {
      const parsed = JSON.parse(pkg);
      console.log(`Current installed version: ${parsed.version}`);
    }
  }
}