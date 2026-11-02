import * as fs from 'fs';
import * as path from 'path';

/** A navigation id another page already uses, and the page that defines it */
export interface MenuId {
  id: string;
  /** The page's title, so the suggestion says which page it is */
  page?: string;
}

const NAVIGATIONS = ['QuickLaunch', 'TopNavigationBar'];
const MAX_FILES = 2000;
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', '.vscode', 'temp']);

/**
 * The `menu` ids used across a doctor project.
 *
 * `parent` points at the `id` of another page's menu entry, so writing one
 * means knowing what the other pages called themselves. Collecting them is a
 * read of the markdown files rather than anything SharePoint knows: the
 * navigation is rebuilt from the files on every publish, so the files are the
 * only place the ids exist before one runs.
 *
 * Deliberately a shallow read — the front matter block and a regex, not a YAML
 * parse of every page — because this runs whenever the panel renders and a
 * project can hold thousands of pages.
 */
export function collectMenuIds(contentFolder: string): MenuId[] {
  const found = new Map<string, MenuId>();
  let budget = MAX_FILES;

  const walk = (folder: string) => {
    if (budget <= 0) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (budget <= 0) {
        return;
      }

      const full = path.join(folder, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) {
          walk(full);
        }
        continue;
      }

      if (!entry.name.endsWith('.md')) {
        continue;
      }

      budget--;
      try {
        readMenuIds(fs.readFileSync(full, 'utf8'), found);
      } catch {
        // A file that cannot be read simply contributes nothing
      }
    }
  };

  walk(contentFolder);

  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Read the ids out of one file's front matter.
 *
 * Exported for testing, and because the shape it looks for is the thing worth
 * pinning down:
 *
 *     menu:
 *       QuickLaunch:
 *         id: tools
 */
export function readMenuIds(contents: string, into = new Map<string, MenuId>()): Map<string, MenuId> {
  if (!contents.startsWith('---')) {
    return into;
  }

  const end = contents.indexOf('\n---', 3);
  const lines = contents.slice(3, end === -1 ? contents.length : end).split('\n');

  const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, '');
  const indentOf = (line: string) => line.length - line.trimStart().length;

  let title: string | undefined;
  for (const line of lines) {
    const match = /^title\s*:\s*(.+)$/.exec(line);
    if (match) {
      title = unquote(match[1]);
      break;
    }
  }

  // YAML nests by indentation, so the block is read by indentation rather than
  // by a regex: `id` only counts when it sits under a navigation, which sits
  // under `menu`. An `id` elsewhere in the front matter is something else.
  let menuIndent: number | null = null;
  let navigationIndent: number | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }

    const indent = indentOf(line);

    if (menuIndent !== null && indent <= menuIndent) {
      // Out of the menu block again
      menuIndent = null;
      navigationIndent = null;
    }

    if (menuIndent === null) {
      if (/^menu\s*:/.test(line.trim()) && indent === 0) {
        menuIndent = indent;
      }
      continue;
    }

    if (navigationIndent !== null && indent <= navigationIndent) {
      navigationIndent = null;
    }

    if (navigationIndent === null) {
      const navigation = NAVIGATIONS.find((n) => new RegExp(`^${n}\\s*:`).test(line.trim()));
      if (navigation) {
        navigationIndent = indent;
      }
      continue;
    }

    const id = /^id\s*:\s*(.+)$/.exec(line.trim());
    if (id) {
      const value = unquote(id[1]);
      if (value && !into.has(value)) {
        into.set(value, { id: value, page: title });
      }
    }
  }

  return into;
}
