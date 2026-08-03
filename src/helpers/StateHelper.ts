import { createHash } from "crypto";
import { executeWithRetry, FileHelpers, Logger } from "@helpers";
import { CliCommand } from "@helpers";
import { basename, dirname, join } from "path";
import { readFileAsync, writeFileAsync } from "@utils";
import { tmpdir } from "os";

export interface DoctorStateEntry {
  sourceHash: string;
  publishedAt: string;
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
  const normalizedStateFile = (stateFile || DEFAULT_STATE_FILE)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
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
   */
  public static markPublished(slug: string, contentHash: string): void {
    if (!StateHelper.state) return;
    StateHelper.state.pages[slug] = {
      sourceHash: contentHash,
      publishedAt: new Date().toISOString(),
    };
    StateHelper.dirty = true;
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
      const folderUrl = FileHelpers.getRelUrl(webUrl, target.folderPath);
      const normalizedAssetLibrary = assetLibrary.replace(/^\/+|\/+$/g, "");
      const normalizedTargetFolder = target.folderPath.replace(/^\/+|\/+$/g, "");
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

  /** Reset singleton state (useful for testing or a fresh publish). */
  public static reset(): void {
    StateHelper.state = null;
    StateHelper.loaded = false;
    StateHelper.dirty = false;
  }
}
