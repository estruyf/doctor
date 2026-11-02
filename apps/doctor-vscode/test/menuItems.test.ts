import { describe, expect, it } from 'vitest';
import {
  addItem,
  normaliseMenuId,
  problemsFor,
  readItems,
  removeItem,
  staticParentIds,
  updateItem,
} from '../src/config/menuItems';

const messages = (items: object[]) => problemsFor(items).map((list) => list.map((p) => p.field));

describe('static navigation items', () => {
  it('normalises an id the way doctor normalises a page parent', () => {
    expect(normaliseMenuId('Getting Started')).toBe('gettingstarted');
    expect(normaliseMenuId('docs')).toBe('docs');
  });

  it('reads a missing list as empty, and anything but a list as unreadable', () => {
    expect(readItems(undefined)).toEqual([]);
    expect(readItems([{ id: 'docs' }])).toEqual([{ id: 'docs' }]);
    expect(readItems({ id: 'docs' })).toBeNull();
  });

  it('flags an item without a name, which doctor skips', () => {
    expect(messages([{ id: 'docs' }])).toEqual([['name']]);
    expect(messages([{ id: 'docs', name: '  ' }])).toEqual([['name']]);
    expect(messages([{ id: 'docs', name: 'Docs' }])).toEqual([[]]);
  });

  it('flags an id pages cannot sit under, and offers the one they can', () => {
    const [[problem]] = problemsFor([{ id: 'Getting Started', name: 'Getting started' }]);
    expect(problem.field).toBe('id');
    expect(problem.fix).toEqual({ key: 'id', value: 'gettingstarted', label: 'Use gettingstarted' });
  });

  it('flags a second item with the same id', () => {
    expect(
      messages([
        { id: 'docs', name: 'Docs' },
        { id: 'docs', name: 'More docs' },
      ])
    ).toEqual([[], ['id']]);
  });

  it('flags parent, which doctor ignores on a static item, and offers to remove it', () => {
    const [[problem]] = problemsFor([{ id: 'docs', name: 'Docs', parent: 'home' }]);
    expect(problem.field).toBe('parent');
    expect(problem.fix?.value).toBeUndefined();
  });

  it('removes a key set to nothing, and leaves keys it does not edit alone', () => {
    const items = [{ id: 'docs', name: 'Docs', url: '/x', items: [{ id: 'nested' }] }];
    expect(updateItem(items, 0, 'url', '')).toEqual([{ id: 'docs', name: 'Docs', items: [{ id: 'nested' }] }]);
    expect(updateItem(items, 0, 'weight', 2)[0].weight).toBe(2);
    expect(updateItem(items, 0, 'weight', NaN)[0]).not.toHaveProperty('weight');
    expect(updateItem(items, 0, 'name', '  Documentation ')[0].name).toBe('Documentation');
  });

  it('gives a new item an id pages can name as their parent', () => {
    expect(addItem([], 'Getting Started')).toEqual([{ id: 'gettingstarted', name: 'Getting Started' }]);
    expect(addItem([], 'Docs', 'documentation')).toEqual([{ id: 'documentation', name: 'Docs' }]);
  });

  it('leaves an empty list when the last item goes, so menu stays and navigation stays on', () => {
    expect(removeItem([{ id: 'docs', name: 'Docs' }], 0)).toEqual([]);
  });

  it('offers the static ids a page parent can point at', () => {
    const config = {
      menu: {
        QuickLaunch: { items: [{ id: 'docs', name: 'Docs' }, { id: 'Bad Id', name: 'Bad' }] },
        TopNavigationBar: { items: [{ id: 'docs', name: 'Again' }, { id: 'tools' }] },
      },
    };
    expect(staticParentIds(config)).toEqual([
      { id: 'docs', name: 'Docs' },
      { id: 'tools', name: undefined },
    ]);
    expect(staticParentIds({})).toEqual([]);
    expect(staticParentIds({ menu: { QuickLaunch: { items: 'nope' } } })).toEqual([]);
  });
});
