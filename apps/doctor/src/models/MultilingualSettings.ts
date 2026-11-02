

export interface MultilingualSettings {
  enableTranslations: boolean;
  overwriteTranslationsOnChange: boolean;
  /**
   * The languages to enable on the site, either as locale names (`nl-nl`) or as
   * the LCIDs SharePoint uses (`1043`). Locale names match what the
   * `localization` front matter uses, so both sides can speak the same language.
   */
  languages: (number | string)[];
  translator: {
    key: string;
    endpoint: string;
    region: string;
  }
}