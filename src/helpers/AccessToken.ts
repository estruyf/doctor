import { Logger } from "./index.js";
import { executeCommand } from "@pnp/cli-microsoft365";


export class AccessToken {

  /**
   * Get an access token for the site
   * @param webUrl 
   * @returns access token
   */
  public static async get(webUrl: string) {
    // `spo set` stores the URL of the *root* site collection. Passing the site URL
    // here corrupts it, as commands which talk to the admin site derive their URL
    // from it and would end up calling `https://<tenant>-admin.sharepoint.com/sites/<site>`.
    const { origin } = new URL(webUrl);

    await executeCommand("spo set", { url: origin });
    const { stdout: token } = await executeCommand("util accesstoken get", {
      resource: origin,
    });
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      throw `Failed to retrieve an access token.`;
    }

    return token;
  }
}