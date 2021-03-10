import { ArgumentsHelper, execScript, Logger } from ".";


export class AccessToken {

  /**
   * Get an access token for the site
   * @param webUrl 
   * @returns access token
   */
  public static async get(webUrl: string) {
    await execScript(ArgumentsHelper.parse(`spo set --url "${webUrl}"`), false);
    const token: string = await execScript(ArgumentsHelper.parse(`util accesstoken get --resource "${`https://${new URL(webUrl).hostname}`}"`), false);
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      throw `Failed to retrieve an access token.`;
    }

    return token;
  }
}