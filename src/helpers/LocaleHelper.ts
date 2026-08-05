/**
 * The locales SharePoint can enable on a site, mapped to their LCID. The
 * `localization` front matter uses the culture name, while `multilingual.languages`
 * uses the LCID, so one has to be resolved into the other to tell whether a
 * translation can be created at all.
 */
const LCID_BY_LOCALE: { [locale: string]: number } = {
  "ar-sa": 1025,
  "bg-bg": 1026,
  "ca-es": 1027,
  "zh-tw": 1028,
  "cs-cz": 1029,
  "da-dk": 1030,
  "de-de": 1031,
  "el-gr": 1032,
  "en-us": 1033,
  "fi-fi": 1035,
  "fr-fr": 1036,
  "he-il": 1037,
  "hu-hu": 1038,
  "it-it": 1040,
  "ja-jp": 1041,
  "ko-kr": 1042,
  "nl-nl": 1043,
  "nb-no": 1044,
  "pl-pl": 1045,
  "pt-br": 1046,
  "hr-hr": 1050,
  "ro-ro": 1048,
  "ru-ru": 1049,
  "sk-sk": 1051,
  "sv-se": 1053,
  "th-th": 1054,
  "tr-tr": 1055,
  "id-id": 1057,
  "uk-ua": 1058,
  "sl-si": 1060,
  "et-ee": 1061,
  "lv-lv": 1062,
  "lt-lt": 1063,
  "vi-vn": 1066,
  "eu-es": 1069,
  "mk-mk": 1071,
  "hi-in": 1081,
  "ms-my": 1086,
  "kk-kz": 1087,
  "cy-gb": 1106,
  "gl-es": 1110,
  "zh-cn": 2052,
  "pt-pt": 2070,
  "sr-latn-cs": 2074,
  "es-es": 3082,
  "bs-latn-ba": 5146,
  "sr-latn-rs": 9242,
  "sr-cyrl-rs": 10266,
};

export class LocaleHelper {
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
