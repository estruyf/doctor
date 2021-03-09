import fetch from 'node-fetch';
import { ArgumentsHelper, Contextinfo } from '.';
import { CommandArguments } from '../models';
import { execScript } from './execScript';
import { Logger } from './logger';

const FEATURE_ID = "24611c05-ee19-45da-955f-6602264abaf8";

export class MultilingualHelper {

  /**
   * Start the multilingual process
   * @param ctx 
   * @param options 
   * @returns 
   */
  public static async start(ctx: any, options: CommandArguments): Promise<void> {
    const { webUrl, multilingual } = options;

    if (!multilingual) {
      return;
    }

    Logger.debug(`Multilingual information: ${JSON.stringify(multilingual)}`)

    await execScript(ArgumentsHelper.parse(`spo set --url "${webUrl}"`), false);
    const token: string = await execScript(ArgumentsHelper.parse(`util accesstoken get --resource "${`https://${new URL(webUrl).hostname}`}"`), false);
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      return;
    }

    Logger.debug(`Token retrieved: ${token.length}`);

    const isEnabled = await this.apiGet(`${webUrl}/_api/web/features/GetById(guid'${FEATURE_ID}')`, {
      "accept": "application/json",
      "Authorization": `Bearer ${token.trim()}`
    });

    if (multilingual.enableTranslations) {
      // When the feature is enabled, the DefinitionId is returned
      if (!isEnabled || !isEnabled.DefinitionId) {
        await this.apiPost(`${webUrl}/_api/web/features/add(guid'${FEATURE_ID}')`, {
          "Authorization": `Bearer ${token.trim()}`,
          "accept": "application/json",
          "content-type": "application/json; odata.metadata=minimal"
        }, {});
      }

      if (multilingual.languages || typeof multilingual.overwriteTranslationsOnChange !== "undefined") {
        let languageData: any = {
          "__metadata": {
            "type": "SP.Web"
          }
        };

        if (multilingual.languages && multilingual.languages.length > 0) {
          languageData.SupportedUILanguageIds = {
            results: [...multilingual.languages]
          }
        }

        if (typeof multilingual.overwriteTranslationsOnChange !== "undefined") {
          languageData.OverwriteTranslationsOnChange = multilingual.overwriteTranslationsOnChange;
        }

        if (Object.keys(languageData).length > 1) {
          const requestDigest: Contextinfo = await this.apiPost(`${webUrl}/_api/contextinfo`, {
            "accept": 'application/json;odata=nometadata',
            "Authorization": `Bearer ${token.trim()}`
          });
          if (!requestDigest || !requestDigest.FormDigestValue) {
            Logger.debug(`Failed to retrieve a digest value.`)
            return;
          }

          await this.apiPatch(`${webUrl}/_api/web`, {
            "Authorization": `Bearer ${token.trim()}`,
            "accept": "application/json",
            "content-type": "application/json;odata=verbose",
            "x-http-method": "MERGE",
            "IF-MATCH": "*",
            "x-requestdigest": requestDigest.FormDigestValue
          }, languageData);
        }
      }
    } else {
      if (isEnabled && isEnabled.DefinitionId) {
        await this.apiPost(`${webUrl}/_api/web/features/remove(guid'${FEATURE_ID}')`, {
          "Authorization": `Bearer ${token.trim()}`,
          "accept": "application/json",
          "content-type": "application/json; odata.metadata=minimal"
        }, {});
      }
    }
  }

  /**
   * Do an API GET request
   * @param url 
   * @param headers 
   * @returns 
   */
  private static async apiGet(url: string, headers: any = {}) {
    try {
      Logger.debug(`GET Request URL: ${url}`);

      const data = await fetch(url, {
        method: "GET",
        headers
      });
      
      if (data && data.ok) {
        const response = await data.json();
        Logger.debug(response);
        return response;
      } else {
        Logger.debug(`No response for GET call to ${url} - status: ${data.status}`);
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }

      return null;
    } catch (err) {
      Logger.debug(err.message);
      throw err.message;
    }
  }

  /**
   * Do an API POST request
   * @param url 
   * @param headers 
   * @param body 
   * @returns 
   */
  private static async apiPost(url: string, headers: any = {}, body: any = {}) {
    try {
      Logger.debug(`POST Request URL: ${url}`);
      Logger.debug(`POST Request BODY: ${JSON.stringify(body)}`);

      const data = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      
      if (data && data.ok) {
        const response = await data.json();
        Logger.debug(response);
        return response;
      } else {
        Logger.debug(`No response for POST call to ${url} - status: ${data.status}`);
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }

      return null;
    } catch (err) {
      Logger.debug(err.message);
      throw err.message;
    }
  }

  /**
   * Do an API PATCH request
   * @param url 
   * @param headers 
   * @param body 
   * @returns 
   */
  private static async apiPatch(url: string, headers: any = {}, body: any = {}): Promise<boolean> {
    try {
      Logger.debug(`PATCH Request URL: ${url}`);
      Logger.debug(`PATCH Request BODY: ${JSON.stringify(body)}`);

      const data = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body)
      });
      
      if (data && data.ok) {
        return true;
      } else {
        Logger.debug(`No response for PATCH call to ${url} - status: ${data.status}`);
        if (data.statusText) {
          Logger.debug(data.statusText);
          Logger.debug(await data.text());
        }
      }
      
      return false;
    } catch (err) {
      Logger.debug(err.message);
      throw err.message;
    }
  }
}