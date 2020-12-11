import Listr = require("listr");
import { execScript } from "../helpers/execScript";
import { CommandArguments } from "../models/CommandArguments";


export class Authenticate {

  /**
   * Authentication task - Splitted for output log of the device code
   * @param auth 
   */
  public static async init(options: CommandArguments) {
    const { auth, username, password } = options;

    await new Listr([
      {
        title: `Authenticate to M365 with ${auth}`,
        task: async () => {
          if (auth === "deviceCode") {
            await execScript(`m365`, [`login`], true);
          } else {
            await execScript(`m365`, [`login`, `--authType password`, `--userName '${username}'`, `--password '${password}'`]);
          }
        }
      }
    ]).run();
  }
}