import { LCID_BY_LOCALE } from "@estruyf/doctor-common";

export class LocaleHelper {
  /**
   * The culture name of an LCID, such as `nl-nl` for 1043, or `null` when it
   * is not a locale SharePoint knows. Used for the `lang` of an HTML page,
   * which takes a BCP 47 tag rather than SharePoint's number.
   * @param lcid A SharePoint language id
   */
  public static getLocale(lcid: number): string | null {
    const match = Object.entries(LCID_BY_LOCALE).find(
      ([, value]) => value === lcid
    );
    return match ? match[0] : null;
  }

  /**
   * Resolve the LCID of a locale name, or `null` when it is not a locale
   * SharePoint knows.
   * @param locale A culture name such as `nl-nl`
   */
  public static getLcid(locale: string): number | null {
    if (!locale) {
      return null;
    }

    const lcid = LCID_BY_LOCALE[locale.trim().toLowerCase()];
    return typeof lcid === "number" ? lcid : null;
  }

  /**
   * Resolve a configured language to its LCID. SharePoint only accepts LCIDs,
   * while the `localization` front matter uses locale names, so the setting
   * takes either and this is where they meet.
   * @param language An entry of the `multilingual.languages` setting
   */
  public static toLcid(language: number | string): number | null {
    if (typeof language === "number") {
      return Number.isInteger(language) ? language : null;
    }

    if (typeof language !== "string") {
      return null;
    }

    const trimmed = language.trim();

    // A numeric string is an LCID which came out of JSON as text
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }

    return LocaleHelper.getLcid(trimmed);
  }

  /**
   * Resolve the configured languages to the LCIDs SharePoint expects. Entries
   * which cannot be resolved are returned separately, so they can be reported
   * instead of silently changing which languages the site ends up with.
   * @param languages The `multilingual.languages` setting
   */
  public static resolveLanguages(languages: (number | string)[] | undefined): {
    lcids: number[];
    unresolved: string[];
  } {
    const lcids: number[] = [];
    const unresolved: string[] = [];

    for (const language of languages || []) {
      const lcid = LocaleHelper.toLcid(language);
      if (lcid === null) {
        unresolved.push(`${language}`);
        continue;
      }

      if (!lcids.includes(lcid)) {
        lcids.push(lcid);
      }
    }

    return { lcids, unresolved };
  }

  /**
   * Tells whether a translation can be created for this locale. A site only
   * accepts the languages it has enabled, and `multilingual.languages` is what
   * doctor enables. An unknown locale is left to SharePoint to judge, as the
   * mapping here only covers the languages it supports today.
   * @param locale The locale from the `localization` front matter
   * @param languages The `multilingual.languages` setting
   */
  public static isEnabled(
    locale: string,
    languages: (number | string)[] | undefined,
  ): boolean {
    if (!languages || languages.length === 0) {
      return true;
    }

    const lcid = LocaleHelper.getLcid(locale);
    if (lcid === null) {
      return true;
    }

    return LocaleHelper.resolveLanguages(languages).lcids.includes(lcid);
  }
}
