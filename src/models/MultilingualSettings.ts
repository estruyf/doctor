

export interface MultilingualSettings {
  enableTranslations: boolean;
  overwriteTranslationsOnChange: boolean;
  languages: number[];
  translator: {
    key: string;
    endpoint: string;
    region: string;
  }
}