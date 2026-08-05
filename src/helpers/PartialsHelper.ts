import matter from "gray-matter";
import { dirname, extname, isAbsolute, join, relative, resolve } from "path";
import {
  CommandArguments,
  PageFrontMatter,
  PagePartials,
  PartialsSettings,
} from "@models";
import { Logger, ShortcodesHelpers, StateHelper } from "@helpers";
import { existsAsync, readFileAsync, relativePath } from "@utils";

const DEFAULT_FOLDER = "./partials";
const MAX_DEPTH = 10;

// `<include file="navigation" />` and `<include file="navigation"></include>`
const INCLUDE_REGEX = /<include\s+([^>]*?)\s*\/?>(\s*<\/include>)?/gi;
const ATTRIBUTE_REGEX = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
// Markdown links and images: `[text](target)` / `![alt](target "title")`
const MARKDOWN_LINK_REGEX = /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
// Reference style link definitions: `[ref]: target`
const MARKDOWN_REFERENCE_REGEX = /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm;
const HTML_ATTRIBUTE_REGEX = /(\s(?:href|src)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
// Targets that never point at a file in the sources
const EXTERNAL_LINK_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

interface ResolvedPage {
  content: string;
  hash: string;
}

export class PartialsHelper {
  private static settings: PartialsSettings | null = null;
  private static folder: string = resolve(process.cwd(), DEFAULT_FOLDER);
  private static cache: Map<string, ResolvedPage> = new Map();

  /**
   * Initialize the partials for the current run
   * @param options
   */
  public static init(options: CommandArguments) {
    PartialsHelper.reset();

    PartialsHelper.settings = options.partials || null;
    PartialsHelper.folder = resolve(
      process.cwd(),
      PartialsHelper.settings?.folder || DEFAULT_FOLDER,
    );

    Logger.debug(`Partials folder: ${PartialsHelper.folder}`);
  }

  public static reset() {
    PartialsHelper.settings = null;
    PartialsHelper.folder = resolve(process.cwd(), DEFAULT_FOLDER);
    PartialsHelper.cache.clear();
  }

  /**
   * Resolve the partials for a page and return its content together with the
   * hash used for change detection.
   *
   * The result is cached per file, because the processing plan, the status
   * command, and the page processing itself all need the same outcome.
   * @param file
   * @param contents The raw file contents, including its front matter
   * @param options
   */
  public static async process(
    file: string,
    contents: string,
    options: CommandArguments,
  ): Promise<ResolvedPage> {
    const cached = PartialsHelper.cache.get(file);
    if (cached) {
      return cached;
    }

    const markup = matter(contents);
    const body = markup.content;
    const content = await PartialsHelper.resolvePage(
      file,
      markup.data as PageFrontMatter,
      body,
      options,
    );

    // Pages without partials keep their original hash, so enabling the feature
    // doesn't republish the whole site. Pages with partials fold the resolved
    // content into the hash, otherwise a changed partial would leave every
    // page that uses it marked as unchanged.
    const hash =
      content === body
        ? StateHelper.hashContent(contents)
        : StateHelper.hashContent(`${contents}\n${content}`);

    const resolved: ResolvedPage = { content, hash };
    PartialsHelper.cache.set(file, resolved);
    return resolved;
  }

  /**
   * The glob patterns to exclude when fetching the markdown files, so partials
   * stored inside the start folder don't get published as pages.
   * @param options
   */
  public static getIgnorePatterns(options: CommandArguments): string[] {
    const folder = resolve(
      process.cwd(),
      options.partials?.folder || DEFAULT_FOLDER,
    );
    const startFolder = resolve(process.cwd(), options.startFolder);
    const rel = relative(startFolder, folder).replace(/\\/g, "/");

    // Only relevant when the partials live inside the start folder
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      return [];
    }

    return [`${startFolder.replace(/\\/g, "/")}/${rel}/**`];
  }

  /**
   * Inject the configured partials and expand the include tags of a page
   * @param file
   * @param data
   * @param body
   * @param options
   */
  private static async resolvePage(
    file: string,
    data: PageFrontMatter | undefined,
    body: string,
    options: CommandArguments,
  ): Promise<string> {
    const pageDir = dirname(file);

    let content = await PartialsHelper.expand(
      body,
      pageDir,
      pageDir,
      [file],
      options,
      false,
    );

    const header = PartialsHelper.getAutoPartial("header", data);
    if (header) {
      const partial = await PartialsHelper.load(
        header,
        process.cwd(),
        pageDir,
        [file],
        options,
      );
      content = `${partial}\n\n${content}`;
    }

    const footer = PartialsHelper.getAutoPartial("footer", data);
    if (footer) {
      const partial = await PartialsHelper.load(
        footer,
        process.cwd(),
        pageDir,
        [file],
        options,
      );
      content = `${content}\n\n${partial}`;
    }

    return content;
  }

  /**
   * Check if an automatically injected partial is configured and not disabled
   * on the page itself
   * @param kind
   * @param data
   */
  private static getAutoPartial(
    kind: "header" | "footer",
    data: PageFrontMatter | undefined,
  ): string | null {
    const configured = PartialsHelper.settings?.[kind];
    if (!configured) {
      return null;
    }

    const pagePartials: PagePartials | undefined = data?.partials;
    if (pagePartials === false) {
      return null;
    }

    if (
      typeof pagePartials === "object" &&
      pagePartials !== null &&
      pagePartials[kind] === false
    ) {
      return null;
    }

    return configured;
  }

  /**
   * Expand the include tags of a piece of content and rebase its links when the
   * content originates from a partial
   * @param content
   * @param sourceDir The folder of the file the content was written in
   * @param pageDir The folder of the page the content ends up on
   * @param stack The files which are currently being resolved
   * @param options
   * @param isPartial
   */
  private static async expand(
    content: string,
    sourceDir: string,
    pageDir: string,
    stack: string[],
    options: CommandArguments,
    isPartial: boolean,
  ): Promise<string> {
    // Code samples showing an include tag should be left as-is
    const snippets: string[] = [];
    let masked = ShortcodesHelpers.maskCode(content, snippets);

    if (isPartial) {
      masked = PartialsHelper.rebaseLinks(
        masked,
        sourceDir,
        pageDir,
        options.startFolder,
      );
    }

    const matches = [...masked.matchAll(INCLUDE_REGEX)];
    if (matches.length === 0) {
      return ShortcodesHelpers.unmaskCode(masked, snippets);
    }

    let expanded = "";
    let lastIndex = 0;

    for (const match of matches) {
      const attributes = PartialsHelper.getAttributes(match[1]);
      const reference = attributes.file || attributes.name || attributes.src;

      if (!reference) {
        throw new Error(
          `An <include /> tag in "${relativePath(
            stack[stack.length - 1],
          )}" has no "file" attribute.`,
        );
      }

      expanded += masked.slice(lastIndex, match.index);
      expanded += await PartialsHelper.load(
        reference,
        sourceDir,
        pageDir,
        stack,
        options,
      );
      lastIndex = (match.index ?? 0) + match[0].length;
    }

    expanded += masked.slice(lastIndex);

    return ShortcodesHelpers.unmaskCode(expanded, snippets);
  }

  /**
   * Load a partial and expand it for the page it gets included on
   * @param reference
   * @param sourceDir
   * @param pageDir
   * @param stack
   * @param options
   */
  private static async load(
    reference: string,
    sourceDir: string,
    pageDir: string,
    stack: string[],
    options: CommandArguments,
  ): Promise<string> {
    const partialPath = PartialsHelper.getPartialPath(
      reference,
      sourceDir,
      options,
    );
    const parent = stack[stack.length - 1];

    if (stack.includes(partialPath)) {
      throw new Error(
        `The partial "${relativePath(
          partialPath,
        )}" includes itself. Check the includes of "${relativePath(parent)}".`,
      );
    }

    if (stack.length > MAX_DEPTH) {
      throw new Error(
        `The partials of "${relativePath(
          parent,
        )}" are nested more than ${MAX_DEPTH} levels deep.`,
      );
    }

    if (!(await existsAsync(partialPath))) {
      throw new Error(
        `The partial "${reference}" referenced in "${relativePath(
          parent,
        )}" doesn't exist. Looked for "${relativePath(partialPath)}".`,
      );
    }

    Logger.debug(
      `Including partial "${relativePath(partialPath)}" in "${relativePath(
        stack[0],
      )}"`,
    );

    const contents = await readFileAsync(partialPath, { encoding: "utf-8" });
    if (!contents) {
      return "";
    }

    // Partials may have front matter, so they stay valid markdown files
    const { content } = matter(contents);

    return (
      await PartialsHelper.expand(
        content,
        dirname(partialPath),
        pageDir,
        [...stack, partialPath],
        options,
        true,
      )
    ).trim();
  }

  /**
   * Get the location of a partial.
   *
   * `./x` and `../x` are relative to the file which references the partial,
   * `/x` is relative to the start folder, and everything else is looked up in
   * the partials folder.
   * @param reference
   * @param sourceDir
   * @param options
   */
  private static getPartialPath(
    reference: string,
    sourceDir: string,
    options: CommandArguments,
  ): string {
    let partialPath: string;

    if (isAbsolute(reference)) {
      partialPath = reference;
    } else if (reference.startsWith("./") || reference.startsWith("../")) {
      partialPath = resolve(sourceDir, reference);
    } else if (reference.startsWith("/")) {
      partialPath = join(
        resolve(process.cwd(), options.startFolder),
        reference,
      );
    } else {
      partialPath = join(PartialsHelper.folder, reference);
    }

    return extname(partialPath) ? partialPath : `${partialPath}.md`;
  }

  /**
   * Rewrite the relative links of a partial, so they resolve from the folder of
   * the page the partial gets included on instead of the folder of the partial
   * itself. Links starting with a `/` are resolved from the start folder.
   * @param content
   * @param sourceDir
   * @param pageDir
   * @param startFolder
   */
  private static rebaseLinks(
    content: string,
    sourceDir: string,
    pageDir: string,
    startFolder: string,
  ): string {
    const rebase = (target: string) =>
      PartialsHelper.rebaseTarget(target, sourceDir, pageDir, startFolder);

    return content
      .replace(
        MARKDOWN_LINK_REGEX,
        (_match, start, target, end) => `${start}${rebase(target)}${end}`,
      )
      .replace(
        MARKDOWN_REFERENCE_REGEX,
        (_match, start, target) => `${start}${rebase(target)}`,
      )
      .replace(HTML_ATTRIBUTE_REGEX, (match, start, double, single) => {
        const target = double ?? single;
        const quote = double !== undefined ? `"` : `'`;
        const rebased = rebase(target);
        return rebased === target
          ? match
          : `${start}${quote}${rebased}${quote}`;
      });
  }

  /**
   * Rewrite a single link target
   * @param target
   * @param sourceDir
   * @param pageDir
   * @param startFolder
   */
  private static rebaseTarget(
    target: string,
    sourceDir: string,
    pageDir: string,
    startFolder: string,
  ): string {
    // A link to the current page stays a link to the current page
    if (!target || target === "." || EXTERNAL_LINK_REGEX.test(target)) {
      return target;
    }

    const hashIndex = target.indexOf("#");
    const path = hashIndex === -1 ? target : target.substring(0, hashIndex);
    const hash = hashIndex === -1 ? "" : target.substring(hashIndex);

    if (!path) {
      return target;
    }

    const absolute = path.startsWith("/")
      ? join(resolve(process.cwd(), startFolder), path)
      : resolve(sourceDir, path);

    let rebased = relative(pageDir, absolute).replace(/\\/g, "/");
    if (!rebased) {
      rebased = ".";
    } else if (!rebased.startsWith(".")) {
      rebased = `./${rebased}`;
    }

    return `${rebased}${hash}`;
  }

  /**
   * Get the attributes of an include tag
   * @param attributes
   */
  private static getAttributes(attributes: string): { [key: string]: string } {
    const result: { [key: string]: string } = {};

    for (const match of attributes.matchAll(ATTRIBUTE_REGEX)) {
      result[match[1]] = match[2] ?? match[3] ?? "";
    }

    return result;
  }
}
