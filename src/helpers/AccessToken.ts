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

    return AccessToken.parse(token);
  }

  /**
   * The CLI writes its output as JSON, so a plain string result comes back
   * quoted. Those quotes are part of the value, which turns the header into
   * `Bearer "eyJ..."` and makes SharePoint answer every call with a 401.
   * @param token The raw stdout of the access token command
   */
  public static parse(token: string): string {
    const raw = token.trim();

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed) {
        return parsed.trim();
      }
    } catch {
      // Not JSON encoded, the raw value is the token
    }

    return raw;
  }
}