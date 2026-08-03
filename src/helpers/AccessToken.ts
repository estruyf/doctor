import { Logger } from "./index.js";
import { executeCommand } from "@pnp/cli-microsoft365";


export class AccessToken {

  /**
   * Get an access token for the site
   * @param webUrl 
   * @returns access token
   */
  public static async get(webUrl: string) {
    await executeCommand("spo set", { url: webUrl });
    const { stdout: token } = await executeCommand("util accesstoken get", {
      resource: `https://${new URL(webUrl).hostname}`,
    });
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      throw `Failed to retrieve an access token.`;
    }

    return token;
  }
}
