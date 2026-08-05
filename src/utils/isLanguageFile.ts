export const LANGUAGE_FILE_SUFFIX = ".lang.md";
export const MACHINE_TRANSLATED_SUFFIX = ".machinetranslated.md";

/**
 * A language file holds the content of a localized page. The file name is what
 * identifies it, not its front matter: the `type: translation` value is easy to
 * misspell and a page which is missed here ends up colliding with the slug of
 * the source page it belongs to.
 */
export const isLanguageFile = (filePath: string): boolean =>
  filePath.toLowerCase().endsWith(LANGUAGE_FILE_SUFFIX);

/**
 * Machine translated files are generated during a publish run from the source
 * page, they are not part of the sources.
 */
export const isMachineTranslatedFile = (filePath: string): boolean =>
  filePath.toLowerCase().endsWith(MACHINE_TRANSLATED_SUFFIX);
