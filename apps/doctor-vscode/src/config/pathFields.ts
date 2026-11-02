import * as path from 'path';

/**
 * Settings whose value is a path on disk, and how doctor resolves each one.
 *
 * A picker is only right if it writes the path the way doctor reads it back,
 * and that is not the same for every setting — which is why this is a table
 * taken from doctor's own code rather than "relative to doctor.json" for all:
 *
 * - most are resolved against the folder doctor runs in, which is the one
 *   holding doctor.json;
 * - `siteDesign.logo` is looked for in the content folder first, then next to
 *   doctor.json;
 * - `partials.header`/`footer` are partial references: a bare name is looked
 *   up in `partials.folder`, and `./x` or `../x` against the folder doctor
 *   runs in — for these two, not the page's folder as in an `<include>`. The
 *   `/x` form ("from the content folder") is never written: doctor read it as
 *   an absolute path before 2.3.0, while `./x` resolves the same in every
 *   version.
 *
 * `stateFile` and `library` look like paths and are not: they are paths in
 * the SharePoint asset library, so they get no picker at all.
 */
export type PathBase = 'doctorJson' | 'logo' | 'partial';

export interface PathRule {
  pick: 'file' | 'folder';
  base: PathBase;
  /** Extensions offered by the file dialog, without the dot */
  extensions?: string[];
  title: string;
}

export const PATH_FIELDS: Record<string, PathRule> = {
  folder: { pick: 'folder', base: 'doctorJson', title: 'The folder holding your markdown' },
  certificate: {
    pick: 'file',
    base: 'doctorJson',
    extensions: ['pfx', 'p12', 'pem'],
    title: 'The certificate of the app registration',
  },
  'markdown.shortcodesFolder': {
    pick: 'folder',
    base: 'doctorJson',
    title: 'The folder holding your shortcodes',
  },
  'partials.folder': { pick: 'folder', base: 'doctorJson', title: 'The folder holding your partials' },
  'partials.header': {
    pick: 'file',
    base: 'partial',
    extensions: ['md'],
    title: 'The partial added to the top of every page',
  },
  'partials.footer': {
    pick: 'file',
    base: 'partial',
    extensions: ['md'],
    title: 'The partial added to the bottom of every page',
  },
  'siteDesign.logo': {
    pick: 'file',
    base: 'logo',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
    title: 'The site logo',
  },
};

/** Forward slashes, whatever the OS, because doctor.json is shared */
const posix = (p: string) => p.split(path.sep).join('/');

const isInside = (folder: string, file: string): boolean => {
  const rel = path.relative(folder, file);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
};

/** `./src`, not `src` — the shape doctor.json uses everywhere else */
const dotted = (rel: string) => (rel === '' ? '.' : rel.startsWith('.') ? rel : `./${rel}`);

export interface ResolveContext {
  /** The folder holding doctor.json, which is the folder doctor runs in */
  projectFolder: string;
  /** The content folder, resolved */
  contentFolder: string;
  /** `partials.folder`, resolved */
  partialsFolder: string;
}

/**
 * The value to write for a picked path, the way doctor will read it back.
 *
 * Exported pure, so the rules above can be tested without a file dialog.
 */
export type PickedValue = { value: string } | { error: string };

/**
 * A path relative to `from` in the shape doctor.json uses: `./x` inside it,
 * `../x` beside it. Absolute only when there is no relative form — a file on
 * another drive, on Windows.
 */
const relativeTo = (from: string, picked: string): string => {
  const rel = path.relative(from, picked);
  return path.isAbsolute(rel) ? posix(picked) : dotted(posix(rel));
};

export function valueForPickedPath(rule: PathRule, picked: string, context: ResolveContext): PickedValue {
  switch (rule.base) {
    case 'doctorJson':
      // A certificate kept outside the project is kept there on purpose — so
      // the private key is never committed — and is a path on this machine by
      // nature. Written absolute, it says so; a `../../..` walk would only
      // pretend to be portable.
      if (rule.extensions?.includes('pfx') && !isInside(context.projectFolder, picked)) {
        return { value: posix(picked) };
      }
      return { value: relativeTo(context.projectFolder, picked) };

    case 'logo':
      // doctor tries the content folder first, so that is the shorter, more
      // natural reference when the image lives there
      if (isInside(context.contentFolder, picked)) {
        return { value: posix(path.relative(context.contentFolder, picked)) };
      }
      return { value: relativeTo(context.projectFolder, picked) };

    case 'partial':
      // Inside partials.folder a bare name is enough — that is where doctor
      // looks a name up. Anywhere else, `./x` works: doctor loads the automatic
      // header and footer from the folder it runs in, unlike an `<include>`,
      // which it reads from the page's own folder
      if (isInside(context.partialsFolder, picked)) {
        return { value: posix(path.relative(context.partialsFolder, picked)) };
      }
      return { value: relativeTo(context.projectFolder, picked) };
  }
}

/** Where the file dialog opens: the current value when there is one */
export function dialogStartFor(rule: PathRule, current: unknown, context: ResolveContext): string {
  const base =
    rule.base === 'partial'
      ? context.partialsFolder
      : rule.base === 'logo'
        ? context.contentFolder
        : context.projectFolder;

  if (typeof current === 'string' && current.trim()) {
    const value = current.trim();
    if (path.isAbsolute(value)) {
      return value;
    }
    return path.resolve(base, value);
  }

  return base;
}
