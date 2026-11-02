import { describe, expect, it } from 'vitest';
import schema from '../src/config/doctor-schema.json';
import {
  booleanValue,
  buildGroups,
  countSettings,
  detectStyle,
  FieldDescriptor,
  getAt,
  kindOf,
  parse,
  serialise,
  setAt,
} from '../src/config/configModel';

describe('the table of contents', () => {
  const groups = buildGroups(schema as any);

  it('counts the settings inside an object, not the object', () => {
    const markdown = groups.find((g) => g.fields.some((f) => f.path === 'markdown'))!;
    // markdown.allowHtml, theme, shortcodesFolder, tocLevels, extended
    expect(countSettings(markdown.fields)).toBe(5);
  });

  it('adds up to every setting the form offers', () => {
    const leaves = (fields: FieldDescriptor[]): number =>
      fields.reduce((n, f) => n + (f.children ? leaves(f.children) : 1), 0);
    const total = groups.reduce((n, g) => n + countSettings(g.fields), 0);
    expect(total).toBe(groups.reduce((n, g) => n + leaves(g.fields), 0));
    expect(total).toBeGreaterThan(30);
  });
});

describe('building the form from the schema', () => {
  const groups = buildGroups(schema as any);
  const allPaths = groups.flatMap((g) => g.fields.map((f) => f.path));

  it('offers every setting the schema has, exactly once', () => {
    // A key no group names lands in "Other", so a schema update can never make
    // a setting disappear from the form
    const expected = Object.keys((schema as any).properties).filter((k) => k !== '$schema');
    expect([...allPaths].sort()).toEqual([...expected].sort());
    expect(new Set(allPaths).size).toBe(allPaths.length);
  });

  it('never offers $schema as a setting', () => {
    expect(allPaths).not.toContain('$schema');
  });

  it('masks the credentials', () => {
    const auth = groups.find((g) => g.id === 'auth')!;
    expect(auth.fields.find((f) => f.key === 'password')?.kind).toBe('secret');
    expect(auth.fields.find((f) => f.key === 'certificate')?.kind).toBe('secret');
  });

  it('turns an object with known properties into nested fields', () => {
    const markdown = groups.flatMap((g) => g.fields).find((f) => f.key === 'markdown')!;
    expect(markdown.kind).toBe('object');
    expect(markdown.children?.map((c) => c.path)).toContain('markdown.shortcodesFolder');
  });
});

describe('what kind of control a setting gets', () => {
  it('reads the type, an enum, and an open object', () => {
    expect(kindOf('verbose', { type: 'boolean' })).toBe('boolean');
    expect(kindOf('commandTimeout', { type: 'integer' })).toBe('number');
    expect(kindOf('output', { type: 'string', enum: ['default', 'json'] })).toBe('enum');
    expect(kindOf('url', { type: 'string' })).toBe('text');
    // A shape the form cannot know the fields of is edited as JSON
    expect(kindOf('menu', { type: 'object' })).toBe('json');
  });

  it('ignores a nullable type', () => {
    expect(kindOf('x', { type: ['null', 'boolean'] })).toBe('boolean');
  });
});

describe('editing a value', () => {
  it('reads and writes a nested path', () => {
    const next = setAt({ url: 'u' }, 'markdown.theme', 'light');

    expect(getAt(next, 'markdown.theme')).toBe('light');
    expect(next.url).toBe('u');
  });

  it('keeps keys the schema does not know about', () => {
    // The form edits what it understands and must not drop the rest
    const next = setAt({ url: 'u', somethingNew: { a: 1 } }, 'url', 'v');
    expect(next.somethingNew).toEqual({ a: 1 });
  });

  it('keeps sibling keys in a nested object', () => {
    const next = setAt({ markdown: { theme: 'dark', allowHtml: true } }, 'markdown.theme', 'light');
    expect(next.markdown).toEqual({ theme: 'light', allowHtml: true });
  });

  it('removes a key set to undefined, and the object it leaves empty', () => {
    const next = setAt({ markdown: { theme: 'dark' } }, 'markdown.theme', undefined);
    expect(next).toEqual({});
  });

  it('does not change the object it was given', () => {
    const before = { markdown: { theme: 'dark' } };
    setAt(before, 'markdown.theme', 'light');
    expect(before.markdown.theme).toBe('dark');
  });

  it('keeps the key order, so a save does not reshuffle the file', () => {
    const next = setAt({ a: 1, b: 2, c: 3 }, 'b', 20);
    expect(Object.keys(next)).toEqual(['a', 'b', 'c']);
  });
});

describe('writing the file back', () => {
  it('keeps the indentation the file already uses', () => {
    const text = '{\n    "url": "u"\n}\n';
    expect(serialise({ url: 'v' }, detectStyle(text))).toBe('{\n    "url": "v"\n}\n');
  });

  it('keeps tabs', () => {
    const text = '{\n\t"url": "u"\n}';
    expect(serialise({ url: 'v' }, detectStyle(text))).toBe('{\n\t"url": "v"\n}');
  });

  it('keeps Windows line endings and a missing trailing newline', () => {
    const text = '{\r\n  "url": "u"\r\n}';
    expect(serialise({ url: 'v' }, detectStyle(text))).toBe('{\r\n  "url": "v"\r\n}');
  });

  it('round-trips a file the form did not touch, byte for byte', () => {
    const text = '{\n  "url": "u",\n  "markdown": {\n    "theme": "dark"\n  }\n}\n';
    const parsed = parse(text);
    expect(parsed.ok && serialise(parsed.config, detectStyle(text))).toBe(text);
  });
});

describe('reading the file', () => {
  it('reports invalid JSON rather than replacing it', () => {
    // Rendering empty would mean the first edit overwrites the half-typed text
    const result = parse('{ "url": ');
    expect(result.ok).toBe(false);
  });

  it('refuses a file that is not a JSON object', () => {
    expect(parse('[1, 2]').ok).toBe(false);
    expect(parse('"text"').ok).toBe(false);
  });

  it('treats an empty file as an empty config', () => {
    expect(parse('   ')).toEqual({ ok: true, config: {} });
  });
});

describe('what a checkbox writes', () => {
  it('removes the key when the box goes back to the default', () => {
    expect(booleanValue({ default: false }, false)).toBeUndefined();
    expect(booleanValue({}, false)).toBeUndefined();
  });

  it('writes the value when it differs from the default', () => {
    expect(booleanValue({ default: false }, true)).toBe(true);
  });

  it('writes false for a setting that defaults to true', () => {
    // markdown.extended is on unless said otherwise — removing the key would
    // leave it on, which is the opposite of what unchecking asked for
    expect(booleanValue({ default: true }, false)).toBe(false);
    expect(booleanValue({ default: true }, true)).toBeUndefined();
  });

  it('knows markdown.extended defaults to true', () => {
    const extended = buildGroups(schema as any)
      .flatMap((g) => g.fields)
      .find((f) => f.key === 'markdown')!
      .children!.find((c) => c.key === 'extended')!;
    expect(extended.default).toBe(true);
  });
});
