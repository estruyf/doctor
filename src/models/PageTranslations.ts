export interface PageTranslations {
  '@odata.context': string;
  '@odata.type': string;
  '@odata.id': string;
  '@odata.editLink': string;
  Path: PagePath;
  Version: string;
  'Translations@odata.navigationLink': string;
  Translations: Translations;
}

export interface Translations {
  '@odata.type': string;
  '@odata.id': string;
  '@odata.editLink': string;
  UntranslatedLanguages: any[];
  Items: Item[];
}

export interface Item {
  Culture: string;
  FileStatus: number;
  HasPublishedVersion: boolean;
  LastModified: string;
  Path: PagePath;
  Title: string;
}

export interface PagePath {
  DecodedUrl: string;
}