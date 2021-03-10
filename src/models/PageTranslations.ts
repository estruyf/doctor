export interface PageTranslations {
  '@odata.context': string;
  '@odata.type': string;
  '@odata.id': string;
  '@odata.editLink': string;
  Path: Path;
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
  Path: Path;
  Title: string;
}

export interface Path {
  DecodedUrl: string;
}