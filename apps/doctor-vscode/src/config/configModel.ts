/**
 * The doctor.json editor's model: what the form shows, and how an edit gets
 * back into the file. Pure — no `vscode` — so it can be tested directly.
 */

/** The parts of a JSON Schema node the form reads */
export interface SchemaNode {
  type?: string | string[];
  description?: string;
  title?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  additionalProperties?: boolean | SchemaNode;
}

export type FieldKind =
  | 'text'
  | 'secret'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'json'
  | 'languages'
  | 'menuItems';

/**
 * Settings whose shape the schema describes only loosely, given a control of
 * their own. `multilingual.languages` is an array of names or numbers to the
 * schema; to a person it is a list of languages. The static navigation items
 * are a `$ref` the form would otherwise only offer as JSON.
 */
const SPECIAL_KINDS: Record<string, FieldKind> = {
  'multilingual.languages': 'languages',
  'menu.QuickLaunch.items': 'menuItems',
  'menu.TopNavigationBar.items': 'menuItems',
};

export interface FieldDescriptor {
  /** Dotted path into doctor.json: `markdown.shortcodesFolder` */
  path: string;
  key: string;
  label: string;
  description?: string;
  kind: FieldKind;
  /** The schema's default, which is what an absent key means */
  default?: unknown;
  options?: string[];
  /** Nested fields, for an object with known properties */
  children?: FieldDescriptor[];
}

export interface FieldGroup {
  id: string;
  title: string;
  description?: string;
  fields: FieldDescriptor[];
}

/**
 * The order the form presents doctor.json in.
 *
 * The schema is a flat list of 35 keys in no meaningful order; grouping them
 * by what they are for is the reason a form is worth having over the text.
 * A key the schema has but no group names lands in "Other" rather than being
 * hidden, so a schema update can never make a setting disappear from the form.
 */
const GROUPS: { id: string; title: string; description?: string; keys: string[] }[] = [
  {
    id: 'site',
    title: 'Site',
    description: 'Where the pages are published, and from which folder.',
    keys: ['url', 'folder', 'library', 'webPartTitle'],
  },
  {
    id: 'auth',
    title: 'Authentication',
    description: 'The Entra app registration doctor signs in with.',
    keys: ['auth', 'appId', 'tenant', 'certificate', 'password'],
  },
  {
    id: 'publishing',
    title: 'Publishing',
    description: 'How a publish run behaves.',
    keys: [
      'pageTemplate',
      'reapplyTemplates',
      'skipExistingPages',
      'overwriteImages',
      'disableComments',
      'continueOnError',
      'retryWhenFailed',
      'skipPrecheck',
    ],
  },
  {
    id: 'state',
    title: 'Change detection',
    description: 'Which pages a publish decides are unchanged.',
    keys: ['forceAll', 'removeDeleted', 'disableStatePersistence', 'stateFile'],
  },
  {
    id: 'navigation',
    title: 'Navigation',
    keys: ['menu', 'cleanQuickLaunch', 'cleanTopNavigation'],
  },
  {
    id: 'design',
    title: 'Site design',
    keys: ['siteDesign', 'applyTheme'],
  },
  { id: 'markdown', title: 'Markdown', keys: ['markdown'] },
  { id: 'partials', title: 'Partials', keys: ['partials'] },
  { id: 'multilingual', title: 'Multilingual', keys: ['multilingual'] },
  {
    id: 'output',
    title: 'Output and diagnostics',
    keys: ['output', 'verbose', 'timingDetails', 'commandName', 'commandTimeout'],
  },
];

/** Keys the form never offers, because they are not settings */
const HIDDEN = new Set(['$schema']);

/**
 * Whose value is a credential. Rendered masked, and never pre-filled into a
 * visible input — `certificate` can be a base64 blob of the private key.
 */
const SECRETS = new Set(['password', 'certificate']);

const typeOf = (node: SchemaNode): string | undefined =>
  Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;

/** Words a split-camelCase label should not lowercase */
const ACRONYMS: Record<string, string> = {
  url: 'URL',
  id: 'ID',
  html: 'HTML',
  json: 'JSON',
  toc: 'Table of contents',
};

/**
 * A readable label for a key: `appId` → "App ID", `webPartTitle` → "Web part
 * title". The key itself is shown under it, so the label only has to read well.
 */
export const labelFor = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.toLowerCase());

  const label = words.join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Whether a schema `title` says anything. Nearly every title in doctor's
 * schema is what the generator that made it left behind — the key again, or
 * "The webPartTitle schema" — and showing those is worse than showing nothing.
 */
const meaningfulTitle = (key: string, title?: string): string | undefined =>
  title && title !== key && !/^The .+ schema$/i.test(title) ? title : undefined;

/** How a schema node is edited */
export function kindOf(key: string, node: SchemaNode): FieldKind {
  if (SECRETS.has(key)) {
    return 'secret';
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return 'enum';
  }

  switch (typeOf(node)) {
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
      return 'text';
    case 'object':
      // An object with known properties becomes a nested group; one whose
      // shape is open (menu, siteDesign.chrome, …) is edited as JSON, because
      // a form can only offer the fields it knows about
      return node.properties && Object.keys(node.properties).length > 0 ? 'object' : 'json';
    default:
      return 'json';
  }
}

function describe(path: string, key: string, node: SchemaNode): FieldDescriptor {
  const kind = SPECIAL_KINDS[path] ?? kindOf(key, node);

  const field: FieldDescriptor = {
    path,
    key,
    label: meaningfulTitle(key, node.title) ?? labelFor(key),
    description: node.description,
    kind,
    ...(node.default !== undefined ? { default: node.default } : {}),
  };

  if (kind === 'enum') {
    field.options = (node.enum ?? []).map(String);
  }

  if (kind === 'object' && node.properties) {
    field.children = Object.entries(node.properties).map(([childKey, child]) =>
      describe(`${path}.${childKey}`, childKey, child)
    );
  }

  return field;
}

/** The form, grouped, built from the schema */
export function buildGroups(schema: SchemaNode): FieldGroup[] {
  const properties = schema.properties ?? {};
  const placed = new Set<string>();

  const groups: FieldGroup[] = GROUPS.map((group) => {
    const fields = group.keys
      .filter((key) => key in properties && !HIDDEN.has(key))
      .map((key) => {
        placed.add(key);
        return describe(key, key, properties[key]);
      });

    return { id: group.id, title: group.title, description: group.description, fields };
  }).filter((group) => group.fields.length > 0);

  const rest = Object.keys(properties)
    .filter((key) => !placed.has(key) && !HIDDEN.has(key))
    .map((key) => describe(key, key, properties[key]));

  if (rest.length > 0) {
    groups.push({ id: 'other', title: 'Other', fields: rest });
  }

  return groups;
}

/**
 * How many settings a group holds, counting the settings inside an object
 * rather than the object — `markdown` is five settings, not one. This is the
 * number the editor's table of contents shows next to each group.
 */
export function countSettings(fields: FieldDescriptor[]): number {
  return fields.reduce(
    (total, field) =>
      total + (field.kind === 'object' && field.children ? countSettings(field.children) : 1),
    0
  );
}

/** Read a dotted path out of the config */
export function getAt(config: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, key) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
    config
  );
}

/**
 * Set a dotted path, returning a new config.
 *
 * `undefined` removes the key, and an object left empty by that is removed
 * too — clearing the last `markdown` setting should not leave `"markdown": {}`
 * behind. Every other key, including ones the schema does not know about, is
 * carried over untouched: the form edits what it understands and must not
 * drop what it does not.
 */
export function setAt(
  config: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  const next: Record<string, unknown> = { ...config };

  if (rest.length === 0) {
    if (value === undefined) {
      delete next[head];
    } else {
      next[head] = value;
    }
    return next;
  }

  const current = next[head];
  const child = setAt(
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {},
    rest.join('.'),
    value
  );

  if (Object.keys(child).length === 0) {
    delete next[head];
  } else {
    next[head] = child;
  }

  return next;
}

/** What the existing file looks like, so a save does not reformat it */
export interface FileStyle {
  indent: string | number;
  trailingNewline: boolean;
  eol: '\n' | '\r\n';
}

export function detectStyle(text: string): FileStyle {
  const eol: FileStyle['eol'] = text.includes('\r\n') ? '\r\n' : '\n';
  const firstIndented = /\n([ \t]+)\S/.exec(text);
  const indent = firstIndented
    ? firstIndented[1].startsWith('\t')
      ? '\t'
      : firstIndented[1].length
    : 2;

  return { indent, trailingNewline: /\r?\n$/.test(text), eol };
}

/**
 * The text a config is written back as.
 *
 * Saving through the form should change the lines that changed, not every
 * line: doctor.json is checked in, and a diff that reflows the whole file
 * because the form preferred another indent hides what was actually edited.
 */
export function serialise(config: Record<string, unknown>, style: FileStyle): string {
  let text = JSON.stringify(config, null, style.indent);
  if (style.eol === '\r\n') {
    text = text.replace(/\n/g, '\r\n');
  }
  return style.trailingNewline ? text + style.eol : text;
}

export type ParseResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The file as the form can use it.
 *
 * Invalid JSON is reported rather than replaced: the form would otherwise
 * render empty, and the first edit would overwrite whatever half-typed text
 * was in the file with a fresh object.
 */
export function parse(text: string): ParseResult {
  if (!text.trim()) {
    return { ok: true, config: {} };
  }

  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'doctor.json has to hold a JSON object.' };
    }
    return { ok: true, config: value as Record<string, unknown> };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What a checkbox writes.
 *
 * An absent key means the schema's default, so a box set back to its default
 * removes the key rather than writing it out — the file only carries what was
 * changed. That is not the same as "unchecked removes": `markdown.extended`
 * defaults to true, so unchecking it has to write `false`, and a form which
 * removed the key instead would silently leave it on.
 */
export function booleanValue(field: Pick<FieldDescriptor, 'default'>, checked: boolean): boolean | undefined {
  const fallback = field.default === true;
  return checked === fallback ? undefined : checked;
}

const CERTIFICATE_FILE = /\.(pfx|p12|pem)$/i;

/**
 * Whether a credential's value is safe to show.
 *
 * `certificate` is either a path to a certificate file or the base64 of one.
 * A path is not a secret — hiding `./cert.pfx` only stops you seeing which
 * certificate is configured — so it is shown, and only the inline key is
 * masked. `password` is always masked.
 */
export function isRevealable(key: string, value: unknown): value is string {
  return key === 'certificate' && typeof value === 'string' && CERTIFICATE_FILE.test(value.trim());
}
