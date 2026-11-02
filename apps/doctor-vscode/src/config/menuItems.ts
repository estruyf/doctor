/**
 * The static navigation items in doctor.json — `menu.QuickLaunch.items` and
 * `menu.TopNavigationBar.items` — and what doctor does with them. Pure, so the
 * rules can be tested without a webview.
 *
 * These mirror doctor's `NavigationHelper`; a change there is a change here.
 */

export const MENU_LOCATIONS = ['QuickLaunch', 'TopNavigationBar'] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

export const itemsPath = (location: MenuLocation) => `menu.${location}.items`;

/** One static item, with any key the form does not edit carried along */
export interface StaticMenuItem {
  id?: string;
  name?: string;
  url?: string;
  weight?: number;
  parent?: string;
  items?: unknown;
  [key: string]: unknown;
}

/** The keys the form edits on an item; anything else is left as it is */
export type EditableKey = 'id' | 'name' | 'url' | 'weight';

export interface ItemProblem {
  field: 'id' | 'name' | 'parent';
  message: string;
  /** What to write instead, when there is an obvious fix */
  fix?: { key: 'id' | 'parent'; value: string | undefined; label: string };
}

/**
 * The id a page's `parent` is turned into before doctor looks for it.
 *
 * doctor lowercases a page's `parent` and drops its spaces, then compares that
 * with the static ids exactly as they are written — so a static id only works
 * as a parent when it is already in this form.
 */
export const normaliseMenuId = (id: string): string => id.toLowerCase().replace(/ /g, '');

/** The items at a location, or `null` when what is there is not a list */
export function readItems(value: unknown): StaticMenuItem[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((item) => (item && typeof item === 'object' ? { ...(item as StaticMenuItem) } : {}));
}

/** What doctor will do with each item that is not what it looks like */
export function problemsFor(items: StaticMenuItem[]): ItemProblem[][] {
  const seen = new Map<string, number>();

  return items.map((item, index) => {
    const problems: ItemProblem[] = [];
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const id = typeof item.id === 'string' ? item.id : '';

    if (!name) {
      problems.push({
        field: 'name',
        message: 'doctor skips an item without a name, and every page that sits under it.',
      });
    }

    if (id) {
      const normalised = normaliseMenuId(id);

      if (normalised !== id) {
        problems.push({
          field: 'id',
          message: `Pages cannot sit under this id: doctor lowercases a page's parent and drops its spaces, so it looks for "${normalised}", does not find it, and adds a second item by that name.`,
          fix: { key: 'id', value: normalised, label: `Use ${normalised}` },
        });
      }

      // doctor takes the first item whose id matches exactly
      const first = seen.get(id);
      if (first !== undefined) {
        problems.push({
          field: 'id',
          message: `Item ${first + 1} already uses this id, so every page that names it as its parent goes under that one.`,
        });
      } else {
        seen.set(id, index);
      }
    }

    if (item.parent !== undefined) {
      problems.push({
        field: 'parent',
        message:
          'doctor ignores parent on an item in doctor.json — these are always at the top of the navigation. Pages are nested under them, by their id.',
        fix: { key: 'parent', value: undefined, label: 'Remove parent' },
      });
    }

    return problems;
  });
}

/**
 * The id a new item gets from its name, in the form a page's `parent` can
 * point at.
 */
export const idFromName = (name: string): string => normaliseMenuId(name.trim());

/** Change one key of one item; an empty value removes the key */
export function updateItem(
  items: StaticMenuItem[],
  index: number,
  key: EditableKey | 'parent',
  value: string | number | undefined
): StaticMenuItem[] {
  return items.map((item, i) => {
    if (i !== index) {
      return item;
    }

    const next: Record<string, unknown> = { ...item };
    const empty =
      value === undefined || (typeof value === 'string' && value.trim() === '') || Number.isNaN(value);

    if (empty) {
      delete next[key];
    } else {
      next[key] = typeof value === 'string' ? value.trim() : value;
    }

    return next as StaticMenuItem;
  });
}

/** Add an item, named and with an id pages can sit under */
export function addItem(items: StaticMenuItem[], name: string, id?: string): StaticMenuItem[] {
  const trimmed = name.trim();
  const itemId = (id ?? '').trim() || idFromName(trimmed);
  return [...items, { id: itemId, name: trimmed }];
}

/**
 * Remove an item. The last one going leaves an empty list, never an absent
 * key: removing the key would take an emptied `menu` with it, and `menu` being
 * there is what makes doctor build the navigation at all — every page's own
 * `menu` front matter would quietly stop being published.
 */
export function removeItem(items: StaticMenuItem[], index: number): StaticMenuItem[] {
  return items.filter((_, i) => i !== index);
}

/**
 * The ids pages can name as their parent, from the static items in a
 * doctor.json. Only ids already in the form doctor compares against are
 * offered — any other would not be found.
 */
export function staticParentIds(config: Record<string, unknown>): { id: string; name?: string }[] {
  const menu = config.menu;
  if (!menu || typeof menu !== 'object') {
    return [];
  }

  const found = new Map<string, { id: string; name?: string }>();

  for (const location of MENU_LOCATIONS) {
    const items = readItems((menu as Record<string, { items?: unknown } | undefined>)[location]?.items);

    for (const item of items ?? []) {
      if (typeof item.id === 'string' && item.id && normaliseMenuId(item.id) === item.id && !found.has(item.id)) {
        found.set(item.id, { id: item.id, name: typeof item.name === 'string' ? item.name : undefined });
      }
    }
  }

  return [...found.values()];
}
