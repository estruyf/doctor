import { createHash } from "crypto";
import { executeWithRetry, FileHelpers, Logger } from "@helpers";
import { CliCommand } from "@helpers";
import { basename, dirname, join } from "path";
import { readFileAsync, writeFileAsync } from "@utils";
import { tmpdir } from "os";

export interface DoctorStateEntry {
  sourceHash: string;
  publishedAt: string;
  /**
   * The slug of the source page when this entry is a SharePoint managed
   * translation. Translated pages have no markdown file of their own on the
   * location SharePoint publishes them to, so they can only be matched with
   * their source page.
   */
  translationOf?: string;
}

export interface DoctorState {
  version: number;
  site: string;
  configHash: string | null;
  pages: Record<string, DoctorStateEntry>;
}

const DEFAULT_STATE_FILE = ".doctor/state.json";

const isAlreadyExistsError = (error: unknown): boolean => {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error);

  const normalized = message.toLowerCase();
  return (
    normalized.includes("already exists") ||
    normalized.includes("a file or folder with the name")
  );
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const normalizeStateTarget = (
  assetLibrary: string,
  stateFile: string,
): { folderPath: string; fileName: string; filePath: string } => {
  // The state file path is always relative to the asset library. Leading slashes
  // and relative segments are stripped, so the state can never end up outside of it.
  const normalizedStateFile = (stateFile || DEFAULT_STATE_FILE)
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  const fileName = basename(normalizedStateFile) || "state.json";
  const folderPart = dirname(normalizedStateFile).replace(/\\/g, "/");
  const folderPath =
    folderPart && folderPart !== "."
      ? `${assetLibrary}/${folderPart}`
      : assetLibrary;
  const filePath =
    folderPart && folderPart !== "."
      ? `${assetLibrary}/${folderPart}/${fileName}`
      : `${assetLibrary}/${fileName}`;

  return { folderPath, fileName, filePath };
};

export class StateHelper {
  private static state: DoctorState | null = null;
  private static loaded = false;
  private static dirty = false;
  private static ensuredFolders: string[] = [];

  /** Compute a SHA-256 hex digest of the given string content. */
  public static hashContent(content: string): string {
    return createHash("sha256").update(content, "utf-8").digest("hex");
  }

  /**
   * Download the state file from SharePoint.
   * Returns an empty state if the file does not exist yet.
   */
  public static async load(
    webUrl: string,
    assetLibrary: string,
    stateFile: string = DEFAULT_STATE_FILE,
  ): Promise<void> {
    StateHelper.loaded = true;
    const target = normalizeStateTarget(assetLibrary, stateFile);
    const relUrl = FileHelpers.getRelUrl(webUrl, target.filePath);
    const tmpPath = join(tmpdir(), `doctor-state-load-${Date.now()}.json`);

    try {
      // spo file get --asString is broken with executeCommand (returns "[object Object]").
      // Use --asFile to download to a temp path, then read it ourselves.
      await executeWithRetry(
        "spo file get",
        {
          webUrl,
          url: relUrl,
          asFile: true,
          path: tmpPath,
        },
        CliCommand.getRetry()
      );

      const content = await readFileAsync(tmpPath, { encoding: "utf-8" });
      if (content) {
        const parsed = JSON.parse(content as string);
        if (parsed && parsed.version) {
          StateHelper.state = parsed as DoctorState;
          Logger.debug(`State loaded: ${Object.keys(StateHelper.state.pages).length} pages`);
          return;
        }
      }
    } catch (error) {
      Logger.debug(
        `Failed to load publish state from "${relUrl}". Falling back to empty state. ${toErrorMessage(error)}`,
      );
    } finally {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(tmpPath);
      } catch {}
    }

    StateHelper.state = {
      version: 1,
      site: webUrl,
      configHash: null,
      pages: {},
    };
    Logger.debug("No existing state file found — starting fresh.");
  }

  /** Returns the number of pages currently tracked in state. */
  public static getPageCount(): number {
    return StateHelper.state ? Object.keys(StateHelper.state.pages).length : 0;
  }

  /** Returns true if the slug is already tracked in the loaded state. */
  public static isTracked(slug: string): boolean {
    return !!(StateHelper.state && StateHelper.state.pages[slug]);
  }

  /** Returns all slugs currently tracked in state. */
  public static getTrackedSlugs(): string[] {
    return StateHelper.state ? Object.keys(StateHelper.state.pages) : [];
  }

  /**
   * Always returns true when state has not been loaded.
   */
  public static hasChanged(slug: string, contentHash: string): boolean {
    if (!StateHelper.loaded || !StateHelper.state) {
      return true;
    }
    const existing = StateHelper.state.pages[slug];
    return !existing || existing.sourceHash !== contentHash;
  }

  /**
   * Record a successfully published page in the in-memory state.
   * @param translationOf The slug of the source page, when publishing a translation.
   */
  public static markPublished(
    slug: string,
    contentHash: string,
    translationOf: string | null = null,
  ): void {
    if (!StateHelper.state) return;
    StateHelper.state.pages[slug] = {
      sourceHash: contentHash,
      publishedAt: new Date().toISOString(),
      ...(translationOf ? { translationOf } : {}),
    };
    StateHelper.dirty = true;
  }

  /**
   * Drop a page from the in-memory state, for instance after it got recycled.
   * @returns `true` when the slug was tracked and got removed.
   */
  public static removeTracked(slug: string): boolean {
    if (!StateHelper.state || !StateHelper.state.pages[slug]) {
      return false;
    }
    delete StateHelper.state.pages[slug];
    StateHelper.dirty = true;
    return true;
  }

  /**
   * Determine which tracked pages no longer have a local markdown file, which
   * means they were deleted from the sources since the last publish.
   * @param localSlugs The slugs of all pages which currently exist locally.
   * @param options Set `multilingual` when translations are enabled on the site.
   */
  public static getDeletedSlugs(
    localSlugs: Iterable<string>,
    options: { multilingual?: boolean } = {},
  ): string[] {
    if (!StateHelper.loaded || !StateHelper.state) {
      return [];
    }

    const known = new Set(
      [...localSlugs].map((slug) => slug.toLowerCase()),
    );
    const deleted: string[] = [];

    for (const [slug, entry] of Object.entries(StateHelper.state.pages)) {
      if (known.has(slug.toLowerCase())) {
        continue;
      }

      // Translations are published to a location SharePoint hands out, so they
      // only count as deleted once their source page is gone as well.
      if (entry && entry.translationOf) {
        if (!known.has(entry.translationOf.toLowerCase())) {
          deleted.push(slug);
        }
        continue;
      }

      // State written before translations got tracked has no reference to its
      // source page. Stripping the locale prefix keeps those pages out of the
      // deleted list as long as their source page still exists.
      if (
        options.multilingual &&
        StateHelper.looksLikeTranslation(slug.toLowerCase(), known)
      ) {
        continue;
      }

      deleted.push(slug);
    }

    return deleted;
  }

  private static looksLikeTranslation(
    slug: string,
    localSlugs: Set<string>,
  ): boolean {
    const segments = slug.split("/");
    if (segments.length < 2) {
      return false;
    }
    return localSlugs.has(segments.slice(1).join("/"));
  }

  /** Returns true if state has been modified since the last load. */
  public static isDirty(): boolean {
    return StateHelper.dirty;
  }

  /**
   * Upload the updated state back to SharePoint.
   */
  public static async save(
    webUrl: string,
    assetLibrary: string,
    stateFile: string = DEFAULT_STATE_FILE,
  ): Promise<void> {
    if (!StateHelper.state) return;

    const json = JSON.stringify(StateHelper.state, null, 2);
    const tmpPath = join(tmpdir(), `doctor-state-${Date.now()}.json`);
    const target = normalizeStateTarget(assetLibrary, stateFile);

    try {
      await writeFileAsync(tmpPath, json, { encoding: "utf-8" });

      // Ensure the target state folder exists
      await StateHelper.ensureFolder(webUrl, assetLibrary, target.folderPath);

      const folderUrl = FileHelpers.getRelUrl(webUrl, target.folderPath);

      await executeWithRetry(
        "spo file add",
        {
          webUrl,
          folder: target.folderPath,
          path: tmpPath,
          fileName: target.fileName,
          overwrite: true,
        },
        CliCommand.getRetry()
      );

      Logger.debug(`State saved to SharePoint: ${folderUrl}/${target.fileName}`);
    } finally {
      // Clean up temp file
      try {
        const { unlink } = await import("fs/promises");
        await unlink(tmpPath);
      } catch {}
    }
  }

  /**
   * Create the folder structure for the state file when it doesn't exist yet.
   * The state gets saved after every page, so the folders are only checked once per run.
   */
  private static async ensureFolder(
    webUrl: string,
    assetLibrary: string,
    folderPath: string,
  ): Promise<void> {
    if (StateHelper.ensuredFolders.indexOf(folderPath) !== -1) {
      return;
    }

    const normalizedAssetLibrary = assetLibrary.replace(/^\/+|\/+$/g, "");
    const normalizedTargetFolder = folderPath.replace(/^\/+|\/+$/g, "");
    const folderPart = normalizedTargetFolder.startsWith(
      `${normalizedAssetLibrary}/`,
    )
      ? normalizedTargetFolder.slice(normalizedAssetLibrary.length + 1)
      : normalizedTargetFolder === normalizedAssetLibrary
        ? ""
        : normalizedTargetFolder;
    const nestedFolders = folderPart.split("/").filter(Boolean);
    let currentPath = assetLibrary;

    for (const folderName of nestedFolders) {
      try {
        await executeWithRetry(
          "spo folder add",
          {
            webUrl,
            parentFolderUrl: `/${currentPath}`,
            name: folderName,
          },
          CliCommand.getRetry()
        );
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }
      }
      currentPath = `${currentPath}/${folderName}`;
    }

    StateHelper.ensuredFolders.push(folderPath);
  }

  /** Reset singleton state (useful for testing or a fresh publish). */
  public static reset(): void {
    StateHelper.state = null;
    StateHelper.loaded = false;
    StateHelper.dirty = false;
    StateHelper.ensuredFolders = [];
  }
}
