import * as fs from 'fs';
import * as path from 'path';
import { BUILT_IN_SHORTCODES, type ShortcodeKind } from '@estruyf/doctor-common';
import { readDoctorJson } from '../utils/doctorConfig';

// doctor's own `kind`, shared through `@estruyf/doctor-common`
export type { ShortcodeKind };

export interface ShortcodeAttribute {
  name: string;
  /** Where it was found, which is how far the suggestion can be trusted */
  source: 'declared' | 'inferred';
  description?: string;
}

export interface ShortcodeInfo {
  /** The tag as written in the markdown: `<callout …>` */
  tag: string;
  kind: ShortcodeKind;
  attributes: ShortcodeAttribute[];
  /** Absolute path of the file it came from, or undefined for a built-in */
  file?: string;
  description?: string;
  /** Whether doctor ships it, as opposed to the project's shortcodes folder */
  builtIn: boolean;
  /** `true` when the shortcode wraps content: `<callout>…</callout>` */
  paired: boolean;
}

/**
 * The shortcodes doctor ships, which are available in every project. The list
 * lives in `@estruyf/doctor-common`, held to doctor's renderers by a test there,
 * so what is offered here is what doctor reads.
 */
const BUILT_IN: ShortcodeInfo[] = BUILT_IN_SHORTCODES.map((shortcode) => ({
  tag: shortcode.tag,
  kind: shortcode.kind,
  builtIn: true,
  paired: shortcode.paired,
  description: shortcode.description,
  attributes: shortcode.attributes.map((attribute) => ({
    name: attribute.name,
    source: 'declared',
    description: attribute.description,
  })),
}));

const SHORTCODE_EXTENSIONS = ['.js', '.cjs', '.mjs'];

/**
 * The shortcodes a project offers: the ones doctor ships, plus whatever is in
 * the folder `markdown.shortcodesFolder` points at.
 *
 * A shortcode is a JavaScript module, so the only way to know its name and kind
 * without running it is to read it. Executing them is deliberately not an
 * option: this is somebody's source tree opened in an editor, and a shortcode
 * is free to do anything a Node module can.
 */
export class ShortcodeRegistry {
  private static cache = new Map<string, { at: number; shortcodes: ShortcodeInfo[] }>();

  /** Long enough to stay out of the way while typing, short enough to notice a new file */
  private static readonly TTL = 5000;

  public static clear(): void {
    ShortcodeRegistry.cache.clear();
  }

  /**
   * @param doctorJsonPath the project's doctor.json, which says where the
   * shortcodes folder is
   */
  public static get(doctorJsonPath: string | null): ShortcodeInfo[] {
    if (!doctorJsonPath) {
      return [...BUILT_IN];
    }

    const cached = ShortcodeRegistry.cache.get(doctorJsonPath);
    if (cached && Date.now() - cached.at < ShortcodeRegistry.TTL) {
      return cached.shortcodes;
    }

    const shortcodes = [...BUILT_IN, ...ShortcodeRegistry.readFolder(doctorJsonPath)];
    ShortcodeRegistry.cache.set(doctorJsonPath, { at: Date.now(), shortcodes });
    return shortcodes;
  }

  /** Where `markdown.shortcodesFolder` points, resolved the way doctor resolves it */
  public static folderFor(doctorJsonPath: string): string {
    const config = readDoctorJson(doctorJsonPath);
    const configured = config?.markdown?.shortcodesFolder;
    return path.resolve(
      path.dirname(doctorJsonPath),
      typeof configured === 'string' && configured ? configured : './shortcodes'
    );
  }

  private static readFolder(doctorJsonPath: string): ShortcodeInfo[] {
    const folder = ShortcodeRegistry.folderFor(doctorJsonPath);
    let entries: string[];

    try {
      entries = fs
        .readdirSync(folder)
        .filter((f) => SHORTCODE_EXTENSIONS.includes(path.extname(f)));
    } catch {
      // No shortcodes folder is the normal case, not a problem to report
      return [];
    }

    const found: ShortcodeInfo[] = [];
    for (const entry of entries) {
      const file = path.join(folder, entry);
      try {
        const shortcode = ShortcodeRegistry.read(file, fs.readFileSync(file, 'utf8'));
        if (shortcode) {
          found.push(shortcode);
        }
      } catch {
        // An unreadable shortcode is simply not offered
      }
    }

    return found;
  }

  /**
   * Read a shortcode module's source for what it declares.
   *
   * Exported so it can be tested without a filesystem.
   */
  public static read(file: string, source: string): ShortcodeInfo | null {
    const name = ShortcodeRegistry.matchString(source, 'name');
    if (!name) {
      return null;
    }

    const kind = ShortcodeRegistry.matchString(source, 'kind');

    return {
      tag: name,
      kind: kind === 'webpart' ? 'webpart' : 'inline',
      builtIn: false,
      // A shortcode which takes a second argument to render() is handed the
      // markup it wraps, so it is written as a pair
      paired: /render\s*:\s*(?:async\s*)?\(\s*[^),]+,\s*[^)]+\)/.test(source),
      attributes: ShortcodeRegistry.attributesOf(source),
      file,
      description: ShortcodeRegistry.matchString(source, 'description'),
    };
  }

  /** `name: "callout"` or `name: 'callout'` */
  private static matchString(source: string, key: string): string | undefined {
    const match = new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(source);
    return match?.[1];
  }

  /**
   * The attributes a shortcode reads.
   *
   * A shortcode can list them itself — `attributes: ["count", "path"]` — which
   * is exact. Otherwise they are inferred from what the source reads off its
   * first argument, which finds the common shapes (`attrs.count`,
   * `attributes["path"]`, destructuring) and is offered as a suggestion rather
   * than as truth. Inferring is worth doing because no shortcode written before
   * this existed declares anything.
   */
  private static attributesOf(source: string): ShortcodeAttribute[] {
    const declared = /\battributes\s*:\s*\[([^\]]*)\]/.exec(source);
    if (declared) {
      const names = [...declared[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
      if (names.length > 0) {
        return names.map((name) => ({ name, source: 'declared' as const }));
      }
    }

    const render = /render\s*:\s*(?:async\s*)?\(?\s*(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))/.exec(source);
    const names = new Set<string>();

    // `render: ({ count, path }) => …`
    if (render?.[1]) {
      for (const part of render[1].split(',')) {
        const key = part.split(/[:=]/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(key)) {
          names.add(key);
        }
      }
    }

    // `attrs.count`, `attributes["path"]`
    const parameter = render?.[2];
    if (parameter) {
      const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const m of source.matchAll(new RegExp(`\\b${escaped}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'))) {
        names.add(m[1]);
      }
      for (const m of source.matchAll(
        new RegExp(`\\b${escaped}\\s*\\[\\s*["'\`]([^"'\`]+)["'\`]`, 'g')
      )) {
        names.add(m[1]);
      }
    }

    return [...names].map((name) => ({ name, source: 'inferred' as const }));
  }
}
