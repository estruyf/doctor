import MarkdownIt from "markdown-it";
import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { basename, dirname, join } from "path";
import matter from "gray-matter";
import fg from "fast-glob";
import { CommandArguments, PageFrontMatter } from "@models";
import { existsAsync, readFileAsync, splitLinkTarget } from "@utils";
import { FrontMatterHelper } from "./FrontMatterHelper.js";
import { Logger } from "./Logger.js";
import { PartialsHelper } from "./PartialsHelper.js";
import { StateHelper } from "./StateHelper.js";

/** Enough to find the images and links, whatever the rendering options are */
const reader = new MarkdownIt({ html: true });

const isLocal = (value: string | undefined): value is string =>
  !!value &&
  !value.startsWith("http") &&
  !value.startsWith("data:") &&
  !value.startsWith("#") &&
  !value.startsWith("mailto:") &&
  !value.startsWith("tel:");

/**
 * What a page's published output depends on, besides its own text.
 *
 * The publish state only ever hashed the markdown file and its partials, so a
 * page went unchanged when the things it renders *from* changed — a referenced
 * image, a custom shortcode, a setting in `doctor.json`, or the slug of a page
 * it links to. Those all feed the hash now.
 *
 * Everything is worked out once per run: an image is hashed once however many
 * pages use it, and a page's dependencies once however many times the hash is
 * asked for.
 */
export class DependencyHelper {
  private static files: { [path: string]: string } = {};
  private static slugs: { [path: string]: string | null } = {};
  private static pages: { [file: string]: string } = {};
  private static config: string | null = null;

  public static reset(): void {
    DependencyHelper.files = {};
    DependencyHelper.slugs = {};
    DependencyHelper.pages = {};
    DependencyHelper.config = null;
  }

  /**
   * The hash a page is tracked by: its own content and partials, plus
   * everything it renders from.
   *
   * @param file the markdown file
   * @param contents its raw contents
   * @param options the run's options
   * @param extra anything the caller knows about, such as a page template
   */
  public static async getPageHash(
    file: string,
    contents: string,
    options: CommandArguments,
    extra: string = "",
  ): Promise<{ content: string; hash: string }> {
    const { content, hash } = await PartialsHelper.process(
      file,
      contents,
      options,
    );

    if (!(file in DependencyHelper.pages)) {
      DependencyHelper.pages[file] = await DependencyHelper.getDependencies(
        file,
        content,
        options,
      );
    }

    // The settings are part of every page's own hash, not only a global flag.
    // The global one is written to the state as soon as it is read, and the
    // state is saved after every page — so a run which stopped half way left
    // the new settings recorded while the pages it never reached still matched
    // their old hashes, and the next run skipped them for good.
    const config = await DependencyHelper.getConfigHash(options);

    return {
      content,
      hash: StateHelper.hashContent(
        `${hash}\n${DependencyHelper.pages[file]}\n${config}\n${extra}`,
      ),
    };
  }

  /**
   * The images a page uses, and the slugs of the pages it links to. A link's
   * slug is part of this because renaming a page changes the URL every page
   * linking to it is published with.
   */
  private static async getDependencies(
    file: string,
    content: string,
    options: CommandArguments,
  ): Promise<string> {
    const $ = cheerio.load(reader.render(content));
    const parts: string[] = [];

    const images = [
      ...new Set(
        $("img")
          .toArray()
          .map((img) => $(img).attr("src"))
          .filter(isLocal),
      ),
    ].sort();

    for (const src of images) {
      const path = join(dirname(file), src);
      parts.push(`img:${src}:${await DependencyHelper.hashFile(path)}`);
    }

    const links = [
      ...new Set(
        $("a")
          .toArray()
          .map((link) => $(link).attr("href"))
          .filter(isLocal),
      ),
    ].sort();

    for (const href of links) {
      const slug = await DependencyHelper.getLinkSlug(href, file, options);
      if (slug) {
        parts.push(`link:${href}:${slug}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * The contents of a file, hashed once per run. A file that cannot be read
   * hashes as missing, so it changing later still counts as a change.
   */
  public static async hashFile(path: string): Promise<string> {
    if (path in DependencyHelper.files) {
      return DependencyHelper.files[path];
    }

    try {
      const contents = await readFileAsync(path);
      DependencyHelper.files[path] = createHash("sha256")
        .update(contents as any)
        .digest("hex");
    } catch {
      DependencyHelper.files[path] = "missing";
    }

    return DependencyHelper.files[path];
  }

  /**
   * The slug a relative link resolves to, worked out the same way the links in
   * the page are rewritten, and cached per target.
   */
  private static async getLinkSlug(
    href: string,
    file: string,
    options: CommandArguments,
  ): Promise<string | null> {
    // `./page.md#section` points at `./page.md`; testing the whole string for a
    // `.md` ending would make it `./page.md#section.md` and resolve to nothing
    const { path: href_ } = splitLinkTarget(href);
    if (!href_) {
      return null;
    }

    const target = href_.endsWith(".md")
      ? href_
      : href_ === "."
        ? basename(file)
        : `${href_}.md`;
    const path = join(dirname(file), target);

    if (path in DependencyHelper.slugs) {
      return DependencyHelper.slugs[path];
    }

    DependencyHelper.slugs[path] = null;

    try {
      if (await existsAsync(path)) {
        const contents = await readFileAsync(path, { encoding: "utf-8" });
        const data = contents ? matter(contents).data : null;

        if (data && (data.slug || data.title)) {
          DependencyHelper.slugs[path] = FrontMatterHelper.getSlug(
            data as PageFrontMatter,
            options.startFolder,
            path,
          );
        }
      }
    } catch (e: any) {
      Logger.debug(`Could not resolve the slug of ${path}: ${e?.message || e}`);
    }

    return DependencyHelper.slugs[path];
  }

  /**
   * The settings and shortcodes every page renders through. When this changes,
   * every page is republished — a different markdown theme or web part title
   * changes what lands on the site, whatever the pages themselves say.
   */
  public static async getConfigHash(
    options: CommandArguments,
  ): Promise<string> {
    if (DependencyHelper.config !== null) {
      return DependencyHelper.config;
    }

    const settings = {
      webPartTitle: options.webPartTitle ?? null,
      assetLibrary: options.assetLibrary ?? null,
      markdown: options.markdown ?? null,
      pageTemplate: options.pageTemplate ?? null,
      reapplyTemplates: !!options.reapplyTemplates,
      // Set on the page when it is created, so turning it on or off has to
      // reach the pages which already exist
      disableComments: !!options.disableComments,
      partials: {
        header: options.partials?.header ?? null,
        footer: options.partials?.footer ?? null,
      },
    };

    const parts = [JSON.stringify(settings)];

    // A custom shortcode decides what its pages render, so its code counts
    const folder = options.shortcodesFolder || "./shortcodes";
    try {
      if (await existsAsync(folder)) {
        const files = (
          await fg(`${folder}/**/*.{js,cjs,mjs}`.replace(/\\/g, "/"))
        ).sort();

        for (const shortcode of files) {
          parts.push(
            `shortcode:${shortcode}:${await DependencyHelper.hashFile(shortcode)}`,
          );
        }
      }
    } catch (e: any) {
      Logger.debug(`Could not read the shortcodes folder: ${e?.message || e}`);
    }

    DependencyHelper.config = StateHelper.hashContent(parts.join("\n"));
    return DependencyHelper.config;
  }
}
