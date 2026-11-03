/**
 * The locales SharePoint can enable on a site, mapped to their LCID. The
 * `localization` front matter uses the culture name, while `multilingual.languages`
 * uses the LCID, so one has to be resolved into the other to tell whether a
 * translation can be created at all.
 *
 * It is also the set of culture *names* doctor resolves: a name outside it fails
 * the publish, while any integer LCID is passed straight through. That is why
 * the extension's `doctor.json` editor writes LCIDs.
 */
export const LCID_BY_LOCALE: Readonly<Record<string, number>> = {
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
