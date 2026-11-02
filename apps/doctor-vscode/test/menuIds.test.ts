import { describe, expect, it } from 'vitest';
import { readMenuIds } from '../src/utils/menuIds';

const ids = (contents: string) => [...readMenuIds(contents).values()];

describe('collecting the menu ids a project uses', () => {
  it('reads the id out of a QuickLaunch entry', () => {
    expect(
      ids(`---
title: Tools
menu:
  QuickLaunch:
    id: tools
    weight: 1
---

Body.
`)
    ).toEqual([{ id: 'tools', page: 'Tools' }]);
  });

  it('reads the top navigation too', () => {
    expect(
      ids(`---
title: About
menu:
  TopNavigationBar:
    id: about
---
`).map((m) => m.id)
    ).toEqual(['about']);
  });

  it('ignores an id which is not under a navigation', () => {
    // `id` can appear elsewhere in front matter; only a menu entry's counts
    expect(
      ids(`---
title: Page
id: not-a-menu-id
metadata:
  id: also-not
---
`)
    ).toEqual([]);
  });

  it('ignores a page with no menu block at all', () => {
    expect(ids(`---\ntitle: Page\n---\n\nBody.\n`)).toEqual([]);
  });

  it('ignores a file with no front matter', () => {
    expect(ids(`# Just a heading\n\nmenu:\n  QuickLaunch:\n    id: nope\n`)).toEqual([]);
  });

  it('strips quotes from the id and the title', () => {
    expect(
      ids(`---
title: "Quoted Title"
menu:
  QuickLaunch:
    id: "quoted-id"
---
`)
    ).toEqual([{ id: 'quoted-id', page: 'Quoted Title' }]);
  });

  it('keeps the first page to claim an id, and does not repeat it', () => {
    const found = readMenuIds(`---\ntitle: First\nmenu:\n  QuickLaunch:\n    id: shared\n---\n`);
    readMenuIds(`---\ntitle: Second\nmenu:\n  QuickLaunch:\n    id: shared\n---\n`, found);

    expect([...found.values()]).toEqual([{ id: 'shared', page: 'First' }]);
  });

  it('does not read past the front matter', () => {
    expect(
      ids(`---
title: Page
---

Prose that happens to contain:

menu:
  QuickLaunch:
    id: from-the-body
`)
    ).toEqual([]);
  });
});

describe('reading the block by indentation', () => {
  it('does not take an id that sits outside the navigation it follows', () => {
    // `id` here belongs to `header`, not to the menu entry
    expect(
      ids(`---
title: Page
menu:
  QuickLaunch:
    id: real
header:
  id: not-a-menu-id
---
`).map((m) => m.id)
    ).toEqual(['real']);
  });

  it('takes both navigations when a page uses both', () => {
    expect(
      ids(`---
title: Page
menu:
  QuickLaunch:
    id: left
  TopNavigationBar:
    id: top
---
`).map((m) => m.id).sort()
    ).toEqual(['left', 'top']);
  });

  it('ignores a commented-out entry', () => {
    expect(
      ids(`---
title: Page
menu:
  QuickLaunch:
    # id: commented
    id: real
---
`).map((m) => m.id)
    ).toEqual(['real']);
  });

  it('is not fooled by a nested menu key deeper in the front matter', () => {
    expect(
      ids(`---
title: Page
metadata:
  menu:
    QuickLaunch:
      id: nested
---
`)
    ).toEqual([]);
  });
});
