import { dirname, join, parse } from "path";
import matter from "gray-matter";
import {
  ApiHelper,
  AccessToken,
  Contextinfo,
  Translator,
  MarkdownHelper,
} from "./index.js";
import {
  Item,
  PageTranslations,
  CommandArguments,
  PageFrontMatter,
  PageLocalization,
  PageLocalizationCreation,
  PublishOutput,
  TaskOutput,
} from "@models";
import { Logger } from "./Logger.js";
import { StatusHelper } from "./StatusHelper.js";
import { LocaleHelper } from "./LocaleHelper.js";
import { PartialsHelper } from "./PartialsHelper.js";
import { DoctorTranspiler } from "./DoctorTranspiler.js";
import { TempDataHelper } from "./TempDataHelper.js";
import { existsAsync, readFileAsync } from "@utils";

const FEATURE_ID = "24611c05-ee19-45da-955f-6602264abaf8";

export class MultilingualHelper {
  /**
   * Start the multilingual process
   * @param task
   * @param options
   */
  public static async start(
    task: TaskOutput,
    options: CommandArguments
  ): Promise<void> {
    const { webUrl, multilingual } = options;
    const url = webUrl.endsWith("/") ? webUrl : `${webUrl}/`;

    if (!multilingual) {
      return;
    }

    Logger.debug(
      `Multilingual information to be used for the site: ${JSON.stringify(
        Logger.redact(multilingual)
      )}`
    );

    const token = await AccessToken.get(webUrl);
    Logger.debug(`Token retrieved: ${token.length}`);

    const isEnabled = await ApiHelper.get(
      `${url}_api/web/features/GetById(guid'${FEATURE_ID}')`,
      {
        accept: "application/json",
        Authorization: `Bearer ${token.trim()}`,
      }
    );

    task.output = `Multilingual feature is currently ${
      isEnabled && isEnabled.DefinitionId ? "enabled" : "disabled"
    }`;

    if (multilingual.enableTranslations) {
      // When the feature is enabled, the DefinitionId is returned
      if (!isEnabled || !isEnabled.DefinitionId) {
        task.output = `Enabling the multilingual feature on the site`;
        await ApiHelper.postOrThrow(
          `${url}_api/web/features/add(guid'${FEATURE_ID}')`,
          {
            Authorization: `Bearer ${token.trim()}`,
            accept: "application/json",
            "content-type": "application/json;odata.metadata=minimal",
          }
        );
      }

      // Fetch the languages to enable them on the site
      if (
        multilingual.languages ||
        typeof multilingual.overwriteTranslationsOnChange !== "undefined"
      ) {
        let languageData: any = {
          __metadata: {
            type: "SP.Web",
          },
        };

        // The setting takes locale names as well as LCIDs, SharePoint only
        // takes LCIDs
        const { lcids, unresolved } = LocaleHelper.resolveLanguages(
          multilingual.languages
        );

        if (unresolved.length > 0) {
          throw new Error(
            `The 'multilingual.languages' setting contains ${
              unresolved.length === 1 ? "an entry" : "entries"
            } which cannot be resolved to a language SharePoint supports: ${unresolved.join(
              ", "
            )}. Use a locale name such as "nl-nl", or its LCID.`
          );
        }

        if (lcids.length > 0) {
          languageData.SupportedUILanguageIds = {
            results: lcids,
          };
        }

        if (typeof multilingual.overwriteTranslationsOnChange !== "undefined") {
          languageData.OverwriteTranslationsOnChange =
            multilingual.overwriteTranslationsOnChange;
        }

        if (Object.keys(languageData).length > 1) {
          const requestDigest: Contextinfo = await ApiHelper.post(
            `${url}_api/contextinfo`,
            {
              accept: "application/json;odata=nometadata",
              Authorization: `Bearer ${token.trim()}`,
            }
          );
          if (!requestDigest || !requestDigest.FormDigestValue) {
            throw new Error(
              `Could not retrieve a request digest from ${url}, which is needed to enable the site languages.`
            );
          }

          task.output = `Enabling the site languages: ${lcids.join(", ")}`;

          const updated = await ApiHelper.patch(
            `${url}_api/web`,
            {
              Authorization: `Bearer ${token.trim()}`,
              accept: "application/json",
              "content-type": "application/json;odata=verbose",
              "x-http-method": "MERGE",
              "IF-MATCH": "*",
              "x-requestdigest": requestDigest.FormDigestValue,
            },
            languageData
          );

          // Without the languages enabled on the site, SharePoint refuses to
          // create any translation, so this cannot be a silent failure
          if (!updated) {
            throw new Error(
              `Failed to enable the languages on ${url}. Run with --debug to see the response from SharePoint.`
            );
          }
        }
      }
    } else {
      if (isEnabled && isEnabled.DefinitionId) {
        await ApiHelper.post(
          `${url}_api/web/features/remove(guid'${FEATURE_ID}')`,
          {
            Authorization: `Bearer ${token.trim()}`,
            accept: "application/json",
            "content-type": "application/json;odata.metadata=minimal",
          }
        );
      }
    }
  }

  /**
   * Process multilingual pages
   * @param localization
   * @param filePath
   * @param slug
   * @param options
   * @param task
   * @param output
   * @returns
   */
  public static async linkPage(
    localization: PageLocalization,
    filePath: string,
    slug: string,
    options: CommandArguments,
    task: TaskOutput,
    output: PublishOutput
  ) {
    const { webUrl } = options;
    const url = webUrl.endsWith("/") ? webUrl : `${webUrl}/`;

    if (!localization || Object.keys(localization).length === 0) {
      Logger.debug(`No pages to be linked for "${slug}"`);
      return;
    }

    Logger.debug(
      `Processing "${slug}" its localization pages: ${JSON.stringify(
        localization
      )}`
    );

    const token = await AccessToken.get(url);
    Logger.debug(`Token retrieved: ${token.length}`);

    // 1. Check if the page is already linked to the corresponding language.
    // The slug can contain a folder, which has to stay a path separator for
    // GetByUrl, so only the segments themselves are encoded.
    const encodedSlug = this.encodeSlug(slug);

    const translations: PageTranslations = await ApiHelper.getOrThrow(
      `${url}_api/sitepages/pages/GetByUrl('sitepages/${encodedSlug}')?$select=Path,Version,Translations&$expand=Translations`,
      {
        accept: "application/json",
        Authorization: `Bearer ${token.trim()}`,
      }
    );

    const translatedPages =
      translations &&
      translations.Translations &&
      translations.Translations.Items
        ? translations.Translations.Items
        : [];

    const localizations = Object.keys(localization);
    // A locale which fails must not hide the ones behind it, so each is
    // handled on its own and the failures are reported together at the end.
    const failures: string[] = [];

    for (const locale of localizations) {
      try {
        // A site only accepts translations for the languages it has enabled,
        // and `multilingual.languages` is what doctor enables on it. Catching
        // this here beats the "LanguageCodes out of range" SharePoint returns.
        if (
          !LocaleHelper.isEnabled(
            locale,
            options.multilingual ? options.multilingual.languages : undefined
          )
        ) {
          StatusHelper.addWarning(
            `The "${locale}" localization of "${slug}" was skipped, as it is not part of the 'multilingual.languages' setting in your doctor.json. Doctor enables exactly the languages listed there on the site, so add "${locale}" to translate into it.`
          );
          continue;
        }

        const pageName = localization[locale];

        if (pageName) {
          const localePath = join(dirname(filePath), pageName);
          Logger.debug(
            `Trying to fetch ${locale} localization page (value: ${localePath})`
          );

          if (await existsAsync(localePath)) {
            const translatedPage = await this.getTranslatedPage(
              locale,
              translatedPages,
              url,
              slug,
              token
            );
            if (
              !translatedPage ||
              !translatedPage.Path ||
              !translatedPage.Path.DecodedUrl
            ) {
              throw new Error(
                `SharePoint did not return a page for the "${locale}" translation of "${slug}". Verify the locale is one of the languages enabled on the site.`
              );
            }

            const translatedSlug = translatedPage.Path.DecodedUrl.replace(
              "SitePages/",
              ""
            );
            await DoctorTranspiler.processFile(
              localePath,
              task,
              options,
              output,
              translatedSlug,
              0,
              0,
              slug
            );
          } else {
            throw new Error(
              `The referenced "${locale}" localization page of "${slug}" cannot be found: ${localePath}`
            );
          }
        } else {
          // No language file for this locale, so its content has to come from the
          // Azure Translator service. Every reason it cannot is reported, as a
          // locale which gets silently passed over looks the same as a working one.
          const translator = options.multilingual
            ? options.multilingual.translator
            : null;

          if (!translator) {
            StatusHelper.addWarning(
              `The "${locale}" localization of "${slug}" has no language file linked to it and no translator is configured. Add the 'multilingual.translator' settings to your doctor.json, or link a "${locale}" language file on the page.`
            );
            continue;
          }

          const { key, endpoint, region } = translator;
          const missing = ["key", "endpoint", "region"].filter(
            (setting) => !translator[setting as keyof typeof translator]
          );

          if (missing.length > 0) {
            StatusHelper.addWarning(
              `The "${locale}" localization of "${slug}" cannot be machine translated, the 'multilingual.translator' settings are missing: ${missing.join(
                ", "
              )}.`
            );
            continue;
          }

          const contents = await readFileAsync(filePath, {
            encoding: "utf-8",
          });
          const markup: matter.GrayMatterFile<string> = matter(contents);
          const { data } = markup;

          // Resolve the partials before translating, so the header and footer
          // end up on the translated page in the target language too. The
          // generated page is taken as-is later on, which means this is the
          // only moment the partials of a machine translated page get injected.
          const { content } = await PartialsHelper.process(
            filePath,
            contents,
            options
          );

          const transTitle = await Translator.translate(
            endpoint,
            key,
            locale,
            (data as PageFrontMatter).title,
            region
          );
          Logger.debug(
            `Translated title retrieved: ${JSON.stringify(transTitle)}`
          );

          if (transTitle && transTitle.length > 0) {
            const translatedTitle = transTitle[0]?.translations[0]?.text;
            if (translatedTitle) {
              (data as PageFrontMatter).title = translatedTitle;
            }
          }

          // Convert MD to HTML to correctly translate the page. MD not supported by the translator API.
          const htmlContent = await MarkdownHelper.getHtmlData(
            content,
            options
          );

          const transContent = await Translator.translate(
            endpoint,
            key,
            locale,
            htmlContent,
            region
          );
          Logger.debug(
            `Translated contents retrieved: ${JSON.stringify(transContent)}`
          );

          if (!transContent || transContent.length === 0) {
            StatusHelper.addWarning(
              `The translator returned no content for the "${locale}" localization of "${slug}", so the page was not published. Run with --debug to see the response.`
            );
            continue;
          }

          const pageTranslation = transContent[0].translations;
          Logger.debug(`Create new page for translations`);

          if (data.menu) {
            for (const location in data.menu) {
              if (location) {
                data.menu[location].id = data.title
                  .toLowerCase()
                  .replace(/ /g, "-");
              }
            }
          }

          const pagePath = await TempDataHelper.createPage(
            dirname(filePath),
            parse(filePath).name,
            matter.stringify(
              pageTranslation.map((t) => t.text).join(" "),
              data
            )
          );

          const translatedPage = await this.getTranslatedPage(
            locale,
            translatedPages,
            url,
            slug,
            token
          );
          if (
            !translatedPage ||
            !translatedPage.Path ||
            !translatedPage.Path.DecodedUrl
          ) {
            throw new Error(
              `SharePoint did not return a page for the "${locale}" translation of "${slug}". Verify the locale is one of the languages enabled on the site.`
            );
          }

          const translatedSlug = translatedPage.Path.DecodedUrl.replace(
            "SitePages/",
            ""
          );
          await DoctorTranspiler.processFile(
            pagePath,
            task,
            options,
            output,
            translatedSlug,
            0,
            0,
            slug
          );
        }
      } catch (e) {
        failures.push(
          typeof e === "string" ? e : (e as Error).message || JSON.stringify(e)
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  }

  /**
   * A slug can contain a folder, and that separator has to stay a separator for
   * the SharePoint `GetByUrl` calls. Encoding the whole slug turns it into %2F,
   * which makes SharePoint fail to resolve the page.
   */
  private static encodeSlug(slug: string): string {
    return slug
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  /**
   * Retrieve the translate page for the current locale to process
   * @param locale
   * @param translatedPages
   * @param url
   * @param slug
   * @param token
   */
  private static async getTranslatedPage(
    locale: string,
    translatedPages: Item[],
    url: string,
    slug: string,
    token: string
  ) {
    let translatedPage = translatedPages.find(
      (p) => p.Culture.toLowerCase() === locale.toLowerCase()
    );

    if (!translatedPage) {
      const translationData: PageLocalizationCreation =
        await ApiHelper.postOrThrow(
          `${url}_api/sitepages/pages/GetByUrl('sitepages/${this.encodeSlug(
            slug
          )}')/translations/create`,
        {
          Authorization: `Bearer ${token.trim()}`,
          accept: "application/json",
          "content-type": "application/json;odata=verbose",
        },
        {
          request: {
            __metadata: {
              type: "SP.TranslationStatusCreationRequest",
            },
            LanguageCodes: {
              results: [locale],
            },
          },
        }
      );

      if (translationData && translationData.Items) {
        translatedPage = translationData.Items.find(
          (p) => p.Culture.toLowerCase() === locale.toLowerCase()
        );
      }
    }

    return translatedPage;
  }
}
