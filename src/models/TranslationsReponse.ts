export interface TranslationsResponse {
  detectedLanguage: DetectedLanguage;
  translations: Translation[];
}

export interface Translation {
  text: string;
  to: string;
}

export interface DetectedLanguage {
  language: string;
  score: number;
}