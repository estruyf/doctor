import { describe, expect, it } from 'vitest';
import { ShortcodeRegistry } from '../src/shortcodes/ShortcodeRegistry';
import { openTagBefore } from '../src/shortcodes/ShortcodeCompletion';

const read = (source: string) => ShortcodeRegistry.read('/p/shortcodes/x.cjs', source);

describe('reading a shortcode without running it', () => {
  it('takes the name and treats a missing kind as inline', () => {
    const sc = read(`module.exports = { name: "related", render: () => "" };`);

    expect(sc?.tag).toBe('related');
    expect(sc?.kind).toBe('inline');
    expect(sc?.builtIn).toBe(false);
  });

  it('reads the webpart kind', () => {
    const sc = read(
      `module.exports = { name: "related", kind: "webpart", render: () => ({}) };`
    );

    expect(sc?.kind).toBe('webpart');
  });

  it('ignores a file which declares no name', () => {
    expect(read(`module.exports = { render: () => "" };`)).toBeNull();
  });

  it('prefers the attributes a shortcode declares over what it reads', () => {
    const sc = read(`module.exports = {
      name: "related",
      attributes: ["count", "path"],
      render: (attrs) => attrs.somethingElse,
    };`);

    expect(sc?.attributes.map((a) => a.name)).toEqual(['count', 'path']);
    expect(sc?.attributes.every((a) => a.source === 'declared')).toBe(true);
  });

  it('infers attributes read off the parameter', () => {
    const sc = read(`module.exports = {
      name: "related",
      render: (attrs) => \`\${attrs.count} \${attrs["path"]}\`,
    };`);

    expect(sc?.attributes.map((a) => a.name).sort()).toEqual(['count', 'path']);
    expect(sc?.attributes.every((a) => a.source === 'inferred')).toBe(true);
  });

  it('infers destructured attributes', () => {
    const sc = read(`module.exports = {
      name: "related",
      render: ({ count, path = "/" }) => count + path,
    };`);

    expect(sc?.attributes.map((a) => a.name).sort()).toEqual(['count', 'path']);
  });

  it('knows a shortcode is a pair when it takes the markup', () => {
    const paired = read(`module.exports = { name: "box", render: (attrs, markup) => markup };`);
    const single = read(`module.exports = { name: "icon", render: (attrs) => "" };`);

    expect(paired?.paired).toBe(true);
    expect(single?.paired).toBe(false);
  });

  it('offers the built-ins when there is no project to read', () => {
    const tags = ShortcodeRegistry.get(null).map((s) => s.tag);

    expect(tags).toEqual(expect.arrayContaining(['callout', 'icon', 'toc', 'mermaid']));
    expect(ShortcodeRegistry.get(null).every((s) => s.builtIn)).toBe(true);
  });
});

describe('what the cursor is inside', () => {
  it('finds the tag being written and the attributes already on it', () => {
    expect(openTagBefore('<related count="3" ')).toEqual({
      tag: 'related',
      written: ['count'],
    });
  });

  it('is not inside a tag that was already closed', () => {
    expect(openTagBefore('<related count="3" />')).toBeNull();
    expect(openTagBefore('<callout>text ')).toBeNull();
  });

  it('is not inside anything when there is no tag', () => {
    expect(openTagBefore('Just some prose ')).toBeNull();
    expect(openTagBefore('a < b and ')).toBeNull();
  });

  it('only looks at the last tag on the line', () => {
    expect(openTagBefore('<icon name="a" /> then <related path="/x" ')).toEqual({
      tag: 'related',
      written: ['path'],
    });
  });
});
