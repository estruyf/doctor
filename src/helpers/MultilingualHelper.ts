import * as fs from 'fs';
import * as path from 'path';
import * as matter from "gray-matter";
import { Item, PageTranslations } from './../models/PageTranslations';
import { ApiHelper, AccessToken, Contextinfo, Translator, MarkdownHelper } from '.';
import { CommandArguments, PageFrontMatter, PageLocalization, PageLocalizationCreation, PublishOutput } from '../models';
import { Logger } from './logger';
import { DoctorTranspiler } from './DoctorTranspiler';
import { Subscriber } from 'rxjs';
import { TempDataHelper } from './TempDataHelper';


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

    const token = await AccessToken.get(webUrl);
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
          "content-type": "application/json;odata.metadata=minimal"
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
          const requestDigest: Contextinfo = await ApiHelper.post(`${url}_api/contextinfo`, {
            "accept": 'application/json;odata=nometadata',
            "Authorization": `Bearer ${token.trim()}`
          });
          if (!requestDigest || !requestDigest.FormDigestValue) {
            Logger.debug(`Failed to retrieve a digest value.`)
            return;
          }

          await ApiHelper.patch(`${url}_api/web`, {
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
        await ApiHelper.post(`${url}_api/web/features/remove(guid'${FEATURE_ID}')`, {
          "Authorization": `Bearer ${token.trim()}`,
          "accept": "application/json",
          "content-type": "application/json;odata.metadata=minimal"
        });
      }
    }
  }

  /**
   * Process multilingual pages
   * @param localization 
   * @param filePath 
   * @param slug 
   * @param options 
   * @param observer 
   * @param output
   * @returns 
   */
  public static async linkPage(localization: PageLocalization, filePath: string, slug: string, options: CommandArguments, observer: Subscriber<string>, output: PublishOutput) {
    const { webUrl } = options;
    const url = webUrl.endsWith('/') ? webUrl : `${webUrl}/`;

    if (!!localization || Object.keys(localization).length === 0) {
      Logger.debug(`No pages to be link for "${slug}"`);
    }

    Logger.debug(`Processing "${slug}" its localization pages: ${JSON.stringify(localization)}`);

    const token = await AccessToken.get(url);
    Logger.debug(`Token retrieved: ${token.length}`);
    
    // 1. Check if the page is already linked to the corresponding language
    const translations: PageTranslations = await ApiHelper.get(`${url}_api/sitepages/pages/GetByUrl('sitepages/${encodeURIComponent(slug)}')?$select=Path,Version,Translations&$expand=Translations`, {
      "accept": "application/json",
      "Authorization": `Bearer ${token.trim()}`
    });

    const translatedPages = translations && translations.Translations && translations.Translations.Items ? translations.Translations.Items : [];

    const localizations = Object.keys(localization);
    for (const locale of localizations) {
      const pageName = localization[locale];
      
      if (pageName) {
        const localePath = path.join(path.dirname(filePath), pageName);
        Logger.debug(`Trying to fetch ${locale} localization page (value: ${localePath})`);

        if (fs.existsSync(localePath)) {
          const translatedPage = await this.getTranslatedPage(locale, translatedPages, url, slug, token);
          if (!translatedPage || !translatedPage.Path || !translatedPage.Path.DecodedUrl) {
            return;
          }

          const translatedSlug = translatedPage.Path.DecodedUrl.replace("SitePages/", "");
          await DoctorTranspiler.processFile(localePath, observer, options, output, translatedSlug);
        } else {
          Logger.debug(`The referenced ${locale} localization page cannot be found (value: "${localePath}").`)
          return;
        }
      } else {
        if (options.multilingual && options.multilingual.translator) {
          const { translator: { key, endpoint, region } } = options.multilingual;
          if (key && endpoint) {
            const contents = fs.readFileSync(filePath, { encoding: "utf-8" });
            const markup: matter.GrayMatterFile<string> = matter(contents);
            const { content, data } = markup;

            const transTitle = await Translator.translate(endpoint, key, locale, (data as PageFrontMatter).title, region);
            Logger.debug(`Translated title retrieved: ${JSON.stringify(transTitle)}`);

            if (transTitle && transTitle.length > 0) {
              const translatedTitle = transTitle[0]?.translations[0]?.text;
              if (translatedTitle) {
                (data as PageFrontMatter).title = translatedTitle;
              }
            }

            // Convert MD to HTML to correctly translate the page. MD not supported by the translator API.
            const htmlContent = await MarkdownHelper.getHtmlData(content);

            const transContent = await Translator.translate(endpoint, key, locale, htmlContent, region);
            Logger.debug(`Translated contents retrieved: ${JSON.stringify(transContent)}`);

            if (transContent && transContent.length > 0) {
              const pageTranslation = transContent[0].translations;
              Logger.debug(`Create new page for translations`);

              const pagePath = TempDataHelper.createPage(path.dirname(filePath), path.parse(filePath).name, matter.stringify(pageTranslation.map(t => t.text).join(' '), data));

              const translatedPage = await this.getTranslatedPage(locale, translatedPages, url, slug, token);
              if (!translatedPage || !translatedPage.Path || !translatedPage.Path.DecodedUrl) {
                return;
              }

              const translatedSlug = translatedPage.Path.DecodedUrl.replace("SitePages/", "");
              await DoctorTranspiler.processFile(pagePath, observer, options, output, translatedSlug);
            }
          }
        }
      }
    }
  }

  /**
   * Retrieve the translate page for the current locale to process
   * @param locale 
   * @param translatedPages 
   * @param url 
   * @param slug 
   * @param token 
   */
  private static async getTranslatedPage(locale: string, translatedPages: Item[], url: string, slug: string, token: string) {
    let translatedPage = translatedPages.find(p => p.Culture.toLowerCase() === locale.toLowerCase());
    
    if (!translatedPage) {
      const translationData: PageLocalizationCreation = await ApiHelper.post(`${url}_api/sitepages/pages/GetByUrl('sitepages/${encodeURIComponent(slug)}')/translations/create`, {
        "Authorization": `Bearer ${token.trim()}`,
        "accept": "application/json",
        "content-type": "application/json;odata=verbose"
      }, {
        request: {
          "__metadata": {
            type: "SP.TranslationStatusCreationRequest"
          },
          LanguageCodes: {
            results: [locale]
          }
        }
      });

      if (translationData && translationData.Items) {
        translatedPage = translationData.Items.find(p => p.Culture.toLowerCase() === locale.toLowerCase())
      }
    }

    return translatedPage;
  }
}