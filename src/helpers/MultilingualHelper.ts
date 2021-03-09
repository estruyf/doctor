import { ApiHelper, ArgumentsHelper, Contextinfo } from '.';
import { CommandArguments } from '../models';
import { execScript } from './execScript';
import { Logger } from './logger';

const FEATURE_ID = "24611c05-ee19-45da-955f-6602264abaf8";

export class MultilingualHelper {

  /**
   * Start the multilingual process
   * @param ctx 
   * @param options
   */
  public static async start(ctx: any, options: CommandArguments): Promise<void> {
    const { webUrl, multilingual } = options;
    const url = webUrl.endsWith('/') ? webUrl : `${webUrl}/`;

    if (!multilingual) {
      return;
    }

    Logger.debug(`Multilingual information to be used for the site: ${JSON.stringify(multilingual)}`)

    await execScript(ArgumentsHelper.parse(`spo set --url "${webUrl}"`), false);
    const token: string = await execScript(ArgumentsHelper.parse(`util accesstoken get --resource "${`https://${new URL(webUrl).hostname}`}"`), false);
    if (!token) {
      Logger.debug(`Failed to retrieve an access token.`)
      return;
    }

    Logger.debug(`Token retrieved: ${token.length}`);

    const isEnabled = await ApiHelper.get(`${url}_api/web/features/GetById(guid'${FEATURE_ID}')`, {
      "accept": "application/json",
      "Authorization": `Bearer ${token.trim()}`
    });

    if (multilingual.enableTranslations) {
      // When the feature is enabled, the DefinitionId is returned
      if (!isEnabled || !isEnabled.DefinitionId) {
        await ApiHelper.post(`${url}_api/web/features/add(guid'${FEATURE_ID}')`, {
          "Authorization": `Bearer ${token.trim()}`,
          "accept": "application/json",
          "content-type": "application/json; odata.metadata=minimal"
        });
      }

      // Fetch the languages to enable them on the site
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
          const requestDigest: Contextinfo = await ApiHelper.post(`${url}/_api/contextinfo`, {
            "accept": 'application/json;odata=nometadata',
            "Authorization": `Bearer ${token.trim()}`
          });
          if (!requestDigest || !requestDigest.FormDigestValue) {
            Logger.debug(`Failed to retrieve a digest value.`)
            return;
          }

          await ApiHelper.patch(`${url}/_api/web`, {
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
        await ApiHelper.post(`${url}/_api/web/features/remove(guid'${FEATURE_ID}')`, {
          "Authorization": `Bearer ${token.trim()}`,
          "accept": "application/json",
          "content-type": "application/json; odata.metadata=minimal"
        });
      }
    }
  }
}