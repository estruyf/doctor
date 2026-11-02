import { describe, expect, it } from 'vitest';
import schema from '../../../schema/2.1.0.json';
import { buildGroups } from '../src/config/configModel';
import {
  addLanguage,
  builtInLanguages,
  canonicalTag,
  DOCTOR_LOCALES,
  parseCustomLcid,
  readInstalledLanguages,
  replaceEntry,
  resolveEntry,
} from '../src/config/languages';

const sharePoint = [
  { lcid: 1043, tag: 'nl-NL', name: 'Dutch' },
  { lcid: 1033, tag: 'en-US', name: 'English' },
  // A language SharePoint offers that doctor's own table does not have
  { lcid: 2108, tag: 'ga-IE', name: 'Irish' },
];

describe('the built-in list', () => {
  it('is doctor\'s own table, all 48 of it', () => {
    expect(Object.keys(DOCTOR_LOCALES)).toHaveLength(48);
    expect(DOCTOR_LOCALES['nl-nl']).toBe(1043);
    expect(DOCTOR_LOCALES['sr-cyrl-rs']).toBe(10266);
  });

  it('names every language, rather than showing the raw tag', () => {
    const list = builtInLanguages('en');
    expect(list).toHaveLength(48);
    expect(list.find((l) => l.lcid === 1043)?.name).toMatch(/Dutch/);
    // Nothing fell back to just the tag
    expect(list.every((l) => l.name.toLowerCase() !== l.tag.toLowerCase())).toBe(true);
  });

  it('writes tags in the casing SharePoint and Intl use', () => {
    expect(canonicalTag('nl-nl')).toBe('nl-NL');
    expect(canonicalTag('sr-latn-rs')).toBe('sr-Latn-RS');
    expect(canonicalTag('bs-latn-ba')).toBe('bs-Latn-BA');
  });
});

describe('reading SharePoint\'s list', () => {
  it('reads the nometadata shape', () => {
    const list = readInstalledLanguages({
      Items: [
        { DisplayName: 'Nederlands', LanguageTag: 'nl-NL', Lcid: 1043 },
        { DisplayName: 'English', LanguageTag: 'en-US', Lcid: 1033 },
      ],
    });
    expect(list.map((l) => l.lcid)).toEqual([1033, 1043]);
  });

  it('reads the verbose shape too', () => {
    const list = readInstalledLanguages({
      d: { Items: { results: [{ DisplayName: 'English', LanguageTag: 'en-US', Lcid: 1033 }] } },
    });
    expect(list).toEqual([{ lcid: 1033, tag: 'en-US', name: 'English' }]);
  });

  it('drops an entry without a usable LCID, rather than offering it', () => {
    const list = readInstalledLanguages({ Items: [{ DisplayName: 'Broken' }, { Lcid: 0 }, { Lcid: 1033, LanguageTag: 'en-US' }] });
    expect(list.map((l) => l.lcid)).toEqual([1033]);
  });

  it('gives a name to a language SharePoint sent without one', () => {
    const [only] = readInstalledLanguages({ Items: [{ LanguageTag: 'nl-NL', Lcid: 1043 }] });
    expect(only.name).toMatch(/Dutch/);
  });

  it('is empty for an answer it does not recognise', () => {
    expect(readInstalledLanguages(null)).toEqual([]);
    expect(readInstalledLanguages({ unexpected: true })).toEqual([]);
  });
});

describe('what is already in the file', () => {
  it('names an LCID from the list', () => {
    expect(resolveEntry(1043, sharePoint)).toEqual({ value: 1043, lcid: 1043, label: 'Dutch' });
  });

  it('calls an LCID the list does not know a custom one, not an error', () => {
    // doctor passes any LCID through, so this is not a problem
    const entry = resolveEntry(9999, sharePoint);
    expect(entry.label).toBe('Custom LCID');
    expect(entry.lcid).toBe(9999);
    expect(entry.problem).toBeUndefined();
  });

  it('keeps a name doctor can resolve, in the form it was written', () => {
    const entry = resolveEntry('nl-nl', sharePoint);
    expect(entry.value).toBe('nl-nl');
    expect(entry.lcid).toBe(1043);
    expect(entry.problem).toBeUndefined();
  });

  it('warns about a name doctor cannot resolve, because that fails the publish', () => {
    // Nobody's list knows this one
    const entry = resolveEntry('xx-yy', sharePoint);
    expect(entry.lcid).toBeNull();
    expect(entry.problem).toMatch(/cannot resolve/);
    expect(entry.replaceWith).toBeUndefined();
  });

  it('recognises a name SharePoint knows, and says which LCID to write instead', () => {
    // SharePoint offers Irish; "ga-ie" is not in doctor's table, so the name
    // still fails the publish — but the language is known, and so is the fix
    const entry = resolveEntry('ga-ie', sharePoint);
    expect(entry.lcid).toBe(2108);
    expect(entry.label).toBe('Irish');
    expect(entry.problem).toMatch(/2108/);
    expect(entry.replaceWith).toBe(2108);
  });

  it('reads a numeric string as the LCID it is', () => {
    expect(resolveEntry('1043', sharePoint).lcid).toBe(1043);
  });
});

describe('adding a language', () => {
  it('adds it as an LCID, which doctor always accepts', () => {
    // Irish comes from SharePoint's list but is not in doctor's table, so
    // writing it by name would fail the publish
    expect(addLanguage([1043], 2108)).toEqual([1043, 2108]);
  });

  it('does not add one that is already there, however it was written', () => {
    expect(addLanguage([1043], 1043)).toEqual([1043]);
    expect(addLanguage(['nl-nl'], 1043)).toEqual(['nl-nl']);
  });

  it('does not add a language already written by a name only SharePoint knows', () => {
    // The bug: "ga-ie" and then 2108 — Irish twice
    expect(addLanguage(['ga-ie'], 2108, sharePoint)).toEqual(['ga-ie']);
  });

  it('starts a list when there was none', () => {
    expect(addLanguage(undefined, 1043)).toEqual([1043]);
  });

  it('leaves the other entries as they were written', () => {
    expect(addLanguage(['nl-nl', 1036], 1033)).toEqual(['nl-nl', 1036, 1033]);
  });
});

describe('a custom LCID', () => {
  it('takes a whole number', () => {
    expect(parseCustomLcid(' 1043 ')).toEqual({ lcid: 1043 });
  });

  it('refuses anything that cannot be an LCID', () => {
    for (const text of ['', 'abc', '10.5', '-1', '0', '99999999', 'nl-nl']) {
      expect(parseCustomLcid(text)).toHaveProperty('error');
    }
  });
});

describe('the form', () => {
  it('gives multilingual.languages the language control, not raw JSON', () => {
    const multilingual = buildGroups(schema as any)
      .flatMap((g) => g.fields)
      .find((f) => f.key === 'multilingual')!;
    const languages = multilingual.children!.find((c) => c.key === 'languages')!;
    expect(languages.kind).toBe('languages');
  });
});

describe('replacing a name with its LCID', () => {
  it('swaps the entry in place, keeping the order', () => {
    expect(replaceEntry([1043, 'ga-ie', 9999], 1, 2108)).toEqual([1043, 2108, 9999]);
  });

  it('does not leave the language twice when its LCID was already there', () => {
    expect(replaceEntry(['ga-ie', 2108], 0, 2108)).toEqual([2108]);
  });
});
