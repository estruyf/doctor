/**
 * The languages `multilingual.languages` can name. Pure — no `vscode` — so the
 * webview and the tests use it too.
 */

export interface Language {
  lcid: number;
  /** BCP 47 tag, as SharePoint gives it: `nl-NL` */
  tag: string;
  /** Human readable name */
  name: string;
}

/**
 * doctor's own locale table, copied from `LCID_BY_LOCALE` in doctor's
 * `LocaleHelper` — one of the copies in doctor's restructure plan.
 *
 * Used when SharePoint cannot be asked. It is also the set of *names* doctor
 * can resolve: a locale name outside it fails the publish, while any integer
 * LCID is passed straight through. That is why this form writes LCIDs.
 */
export const DOCTOR_LOCALES: Record<string, number> = {
  'ar-sa': 1025,
  'bg-bg': 1026,
  'ca-es': 1027,
  'zh-tw': 1028,
  'cs-cz': 1029,
  'da-dk': 1030,
  'de-de': 1031,
  'el-gr': 1032,
  'en-us': 1033,
  'fi-fi': 1035,
  'fr-fr': 1036,
  'he-il': 1037,
  'hu-hu': 1038,
  'it-it': 1040,
  'ja-jp': 1041,
  'ko-kr': 1042,
  'nl-nl': 1043,
  'nb-no': 1044,
  'pl-pl': 1045,
  'pt-br': 1046,
  'hr-hr': 1050,
  'ro-ro': 1048,
  'ru-ru': 1049,
  'sk-sk': 1051,
  'sv-se': 1053,
  'th-th': 1054,
  'tr-tr': 1055,
  'id-id': 1057,
  'uk-ua': 1058,
  'sl-si': 1060,
  'et-ee': 1061,
  'lv-lv': 1062,
  'lt-lt': 1063,
  'vi-vn': 1066,
  'eu-es': 1069,
  'mk-mk': 1071,
  'hi-in': 1081,
  'ms-my': 1086,
  'kk-kz': 1087,
  'cy-gb': 1106,
  'gl-es': 1110,
  'zh-cn': 2052,
  'pt-pt': 2070,
  'sr-latn-cs': 2074,
  'es-es': 3082,
  'bs-latn-ba': 5146,
  'sr-latn-rs': 9242,
  'sr-cyrl-rs': 10266,
};

/** `nl-nl` → `nl-NL`, `sr-latn-rs` → `sr-Latn-RS`: the casing Intl and SharePoint use */
export function canonicalTag(tag: string): string {
  return tag
    .split('-')
    .map((part, i) =>
      i === 0
        ? part.toLowerCase()
        : part.length === 4
          ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          : part.toUpperCase()
    )
    .join('-');
}

/**
 * A readable name for a tag. `Intl.DisplayNames` already knows them, so there
 * is no name table to keep in step with anything.
 */
export function displayName(tag: string, uiLanguage = 'en'): string {
  try {
    const names = new Intl.DisplayNames([uiLanguage, 'en'], { type: 'language' });
    return names.of(canonicalTag(tag)) ?? tag;
  } catch {
    return tag;
  }
}

/** The built-in list, used when SharePoint cannot be asked */
export function builtInLanguages(uiLanguage = 'en'): Language[] {
  return Object.entries(DOCTOR_LOCALES)
    .map(([tag, lcid]) => ({ lcid, tag: canonicalTag(tag), name: displayName(tag, uiLanguage) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * SharePoint's answer to `_api/web/RegionalSettings/InstalledLanguages`.
 *
 * Read defensively, because the shape depends on the OData flavour asked for:
 * `{ Items: [...] }` for nometadata, `{ d: { Items: { results } } }` for
 * verbose. An entry without a usable LCID is dropped rather than offered.
 */
export function readInstalledLanguages(body: any): Language[] {
  const items: any[] =
    body?.Items ?? body?.value ?? body?.d?.Items?.results ?? body?.d?.results ?? [];

  return items
    .map((item) => ({
      lcid: Number(item?.Lcid ?? item?.LCID),
      tag: typeof item?.LanguageTag === 'string' ? item.LanguageTag : '',
      name:
        typeof item?.DisplayName === 'string' && item.DisplayName
          ? item.DisplayName
          : typeof item?.LanguageTag === 'string'
            ? displayName(item.LanguageTag)
            : '',
    }))
    .filter((language) => Number.isInteger(language.lcid) && language.lcid > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What one entry of `multilingual.languages` is, for showing it */
export interface ResolvedEntry {
  /** The value as it stands in the file */
  value: number | string;
  lcid: number | null;
  label: string;
  /** Doctor would fail the publish on it */
  problem?: string;
  /** The LCID to write instead, when the problem has a known fix */
  replaceWith?: number;
}

/**
 * Describe what is already in the file.
 *
 * Entries keep the form they were written in: a name stays a name and an LCID
 * stays an LCID. Only what the form adds is written as an LCID.
 */
export function resolveEntry(value: unknown, known: Language[]): ResolvedEntry {
  if (typeof value === 'number' && Number.isInteger(value)) {
    const match = known.find((l) => l.lcid === value);
    // The LCID itself is shown beside the label, so it is not repeated in it
    return { value, lcid: value, label: match ? match.name : 'Custom LCID' };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return resolveEntry(parseInt(trimmed, 10), known);
    }

    const lcid = DOCTOR_LOCALES[trimmed.toLowerCase()];
    if (typeof lcid === 'number') {
      const match = known.find((l) => l.lcid === lcid);
      return { value, lcid, label: match ? match.name : displayName(trimmed) };
    }

    // A name outside doctor's table fails `doctor publish` with "cannot be
    // resolved", while the LCID of the same language would not. When the
    // list knows the language by its tag, the LCID is known too, so the entry
    // can say exactly what to write instead — and is recognised as that
    // language, so it is not offered a second time.
    const byTag = known.find((l) => l.tag.toLowerCase() === trimmed.toLowerCase());
    if (byTag) {
      return {
        value,
        lcid: byTag.lcid,
        label: byTag.name,
        problem: `doctor cannot resolve the name "${trimmed}". Its LCID, ${byTag.lcid}, works.`,
        replaceWith: byTag.lcid,
      };
    }

    return {
      value,
      lcid: null,
      label: displayName(trimmed),
      problem: `doctor cannot resolve the name "${trimmed}". Remove it and add the language by its LCID instead.`,
    };
  }

  return { value: String(value) as string, lcid: null, label: String(value), problem: 'Not a language name or an LCID.' };
}

/** A typed custom LCID, or why it is not one */
export function parseCustomLcid(text: string): { lcid: number } | { error: string } {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'An LCID is a whole number, such as 1043.' };
  }

  const lcid = parseInt(trimmed, 10);
  // LCIDs are 16-bit language identifiers, possibly with a sort id above them;
  // anything outside that cannot be one
  if (lcid <= 0 || lcid > 0xfffff) {
    return { error: 'That number is outside the range an LCID can have.' };
  }

  return { lcid };
}

/** The array with one more language, unless it is already there */
export function addLanguage(
  current: unknown,
  lcid: number,
  known: Language[] = []
): (number | string)[] {
  const list = Array.isArray(current) ? [...current] : [];
  // Resolved against the list too, so a language already written by a name
  // only SharePoint's list knows is not added again as its LCID
  const present = list.some((entry) => resolveEntry(entry, known).lcid === lcid);
  return present ? list : [...list, lcid];
}

/** The array with one entry swapped for an LCID, keeping its place */
export function replaceEntry(current: unknown, index: number, lcid: number): (number | string)[] {
  const list = Array.isArray(current) ? [...current] : [];
  if (index >= 0 && index < list.length) {
    list[index] = lcid;
  }
  // Swapping can leave the same language twice, if its LCID was there already
  return list.filter((entry, i) => i === index || resolveEntry(entry, []).lcid !== lcid);
}
