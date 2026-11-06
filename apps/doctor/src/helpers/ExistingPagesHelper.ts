import { CommandArguments, TaskOutput } from "@models";
import { CliCommand } from "./CliCommand.js";
import { FileHelpers } from "./FileHelpers.js";
import { Logger } from "./Logger.js";
import { PagesHelper } from "./PagesHelper.js";
import { executeWithRetry } from "./RunCommand.js";
import { StateHelper } from "./StateHelper.js";
import { StatusHelper } from "./StatusHelper.js";

/**
 * Tells doctor's pages from the ones the site owners made, for publishing into
 * a site doctor does not own (`existingPages`).
 *
 * The publish state is the only record of which pages doctor published, so it
 * is the test: a page in Site Pages that is not in the state is not doctor's.
 * That also means a lost state file makes every page look foreign, which is why
 * every message about it says how to adopt the pages again.
 */
export class ExistingPagesHelper {
  /** The slugs this run left alone because they are not doctor's */
  private static protectedPages: Set<string> = new Set();

  public static reset(): void {
    ExistingPagesHelper.protectedPages = new Set();
  }

  /**
   * Whether this run keeps its hands off pages it did not publish. With
   * `update`, the default, doctor writes over them as it always did.
   * @param options
   */
  public static guards(options: Pick<CommandArguments, "existingPages">): boolean {
    return !!options.existingPages && options.existingPages !== "update";
  }

  /**
   * Why the options cannot be used together, or null when they can. Without
   * the publish state every page on the site looks foreign, so `protect` would
   * skip every page after the first run and `fail` would stop every run after
   * it. Refused up front instead of doing either quietly.
   * @param options
   */
  public static validate(
    options: Pick<CommandArguments, "existingPages" | "disableStatePersistence">,
  ): string | null {
    if (ExistingPagesHelper.guards(options) && options.disableStatePersistence) {
      return `"existingPages": "${options.existingPages}" needs the publish state to tell doctor's pages from the site's own, and '--disableStatePersistence' turns the state off. Drop '--disableStatePersistence', or use "existingPages": "update".`;
    }
    return null;
  }

  /**
   * Whether the site already has a page by this name that doctor did not
   * publish. Exists means listed when the run started (`PagesHelper.isListedPage`).
   * @param webUrl
   * @param slug
   */
  public static isForeign(webUrl: string, slug: string): boolean {
    return PagesHelper.isListedPage(webUrl, slug) && !StateHelper.isOwned(slug);
  }

  /**
   * The local pages whose name a page on the site already has, which doctor
   * did not publish. Each slug once, in the order given.
   * @param webUrl
   * @param slugs The slugs of the local pages, without their translations
   */
  public static findConflicts(webUrl: string, slugs: string[]): string[] {
    const seen = new Set<string>();
    const conflicts: string[] = [];
    for (const slug of slugs) {
      const key = slug.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (ExistingPagesHelper.isForeign(webUrl, slug)) {
        conflicts.push(slug);
      }
    }
    return conflicts;
  }

  /**
   * The error a `fail` run stops with, listing every page at once so they can
   * all be sorted out before the next run.
   * @param conflicts
   */
  public static getConflictMessage(conflicts: string[]): string {
    const count = conflicts.length;
    return [
      `${count} page${count === 1 ? "" : "s"} on the site ${count === 1 ? "has" : "have"} the name of a local page, but doctor did not publish ${count === 1 ? "it" : "them"} ("existingPages": "fail"). Nothing was written.`,
      ...conflicts.map((slug) => `  - ${slug}`),
      `Rename the local pages, or run with '--existingPages protect' to skip them. ${ExistingPagesHelper.getRecoveryHint(count > 1)}`,
    ].join("\n");
  }

  /**
   * Record a local page that is skipped because the site's page by that name
   * is not doctor's, and say so in the run's warnings.
   * @param slug
   * @param relPath The markdown file, as the user knows it
   */
  public static protect(slug: string, relPath: string): void {
    ExistingPagesHelper.protectedPages.add(slug.toLowerCase());
    StatusHelper.addWarning(
      `Skipped "${relPath}": the site already has a page "${slug}" that doctor did not publish, so it was left alone ("existingPages": "protect"). ${ExistingPagesHelper.getRecoveryHint(false)}`,
    );
  }

  /**
   * Whether this run skipped the page as not doctor's. Its translations are
   * skipped with it, as they would be made from the site's page.
   * @param slug
   */
  public static isProtected(slug: string): boolean {
    return !!slug && ExistingPagesHelper.protectedPages.has(slug.toLowerCase());
  }

  /** How many local pages this run skipped as not doctor's */
  public static getProtectedCount(): number {
    return ExistingPagesHelper.protectedPages.size;
  }

  /**
   * Narrow the pages a cleanup would remove to the ones doctor published, when
   * the run guards the site's own pages. Unchanged with `update`, where the
   * cleanup owns all of Site Pages as before.
   * @param slugs
   * @param options
   */
  public static onlyOwned(
    slugs: string[],
    options: Pick<CommandArguments, "existingPages">,
  ): string[] {
    if (!ExistingPagesHelper.guards(options)) {
      return slugs;
    }
    return slugs.filter((slug) => StateHelper.isOwned(slug));
  }

  /**
   * Whether the site's welcome page is one doctor published, so another page
   * of doctor's may take its place. No welcome page at all is fair game; one
   * outside Site Pages never is.
   * @param welcomePage The `WelcomePage` of the web, like `SitePages/Home.aspx`
   */
  public static isOwnedWelcomePage(welcomePage: string): boolean {
    const current = `${welcomePage || ""}`.trim().replace(/^\/+/, "");
    if (!current) {
      return true;
    }
    const prefix = "sitepages/";
    if (!current.toLowerCase().startsWith(prefix)) {
      return false;
    }
    return StateHelper.isOwned(current.slice(prefix.length));
  }

  /**
   * The site's current welcome page, when it is not doctor's to replace;
   * otherwise null.
   * @param webUrl
   */
  public static async getForeignHomepage(webUrl: string): Promise<string | null> {
    const { stdout } = await executeWithRetry(
      "spo web get",
      { url: webUrl, output: "json" },
      CliCommand.getRetry(),
    );
    const current = `${JSON.parse(stdout || "{}")?.WelcomePage || ""}`;
    return ExistingPagesHelper.isOwnedWelcomePage(current) ? null : current;
  }

  /**
   * `--cleanStart` for a site doctor shares: removes the pages in the publish
   * state instead of emptying Site Pages. Folders are left, as the site's own
   * pages may live in them.
   *
   * The removed pages are dropped from the state, which is kept: the next
   * steps of the run read it, and saving it is what stops a removed page from
   * counting as unchanged and never coming back.
   * @returns how many pages were removed
   */
  public static async removeOwnedPages(
    webUrl: string,
    task: TaskOutput,
    options: CommandArguments,
  ): Promise<number> {
    return await ExistingPagesHelper.removeFiles(
      webUrl,
      StateHelper.getTrackedSlugs().map((slug) => ({
        name: slug,
        path: `sitepages/${slug}`,
        forget: () => StateHelper.removeTracked(slug),
      })),
      task,
      options,
    );
  }

  /**
   * `--cleanStart` for a site doctor shares: removes the files doctor
   * uploaded to the asset library, as recorded in the publish state, instead
   * of emptying the library — which is often the site's own document library.
   * A state written before uploads were tracked records none, so nothing is
   * removed, which is the safe way to be wrong. The state file itself stays.
   * @returns how many files were removed
   */
  public static async removeOwnedAssets(
    webUrl: string,
    task: TaskOutput,
    options: CommandArguments,
  ): Promise<number> {
    return await ExistingPagesHelper.removeFiles(
      webUrl,
      StateHelper.getAssetPaths().map((path) => ({
        name: path,
        path,
        forget: () => StateHelper.removeAssetHash(path),
      })),
      task,
      options,
    );
  }

  /**
   * Remove files from the site and forget each one in the state, also when it
   * was already gone, which is what a clean start wants.
   */
  private static async removeFiles(
    webUrl: string,
    files: { name: string; path: string; forget: () => void }[],
    task: TaskOutput,
    options: CommandArguments,
  ): Promise<number> {
    let removed = 0;
    for (const file of files) {
      task.output = `Cleaning up: ${file.name}`;
      try {
        await executeWithRetry(
          "spo file remove",
          {
            webUrl,
            url: FileHelpers.getRelUrl(webUrl, file.path),
            force: true,
          },
          CliCommand.getRetry(),
        );
        removed++;
        file.forget();
      } catch (e) {
        const message =
          typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
        if (/does not exist|not found|cannot be found|404/i.test(message)) {
          Logger.debug(`${file.name} no longer exists on the site.`);
          file.forget();
          continue;
        }
        if (!options.continueOnError) {
          throw new Error(`Failed to remove "${file.name}". ${message}`);
        }
        Logger.debug(message);
      }
    }
    return removed;
  }

  /**
   * How to get out of a lost state file, which makes every page doctor
   * published look like the site's own.
   */
  private static getRecoveryHint(plural: boolean): string {
    const empty = StateHelper.getPageCount() === 0;
    const them = plural ? "them" : "it";
    return `${empty ? "The publish state lists no pages at all. " : ""}If doctor did publish ${them} and its state file was lost, one run with '--existingPages update' adopts ${them} again.`;
  }
}
