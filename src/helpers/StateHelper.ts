import { createHash } from "crypto";
import { executeWithRetry, FileHelpers, Logger } from "@helpers";
import { CliCommand } from "@helpers";
import { join } from "path";
import { writeFileAsync } from "@utils";
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

const STATE_FOLDER = ".doctor";
const STATE_FILE = "state.json";

export class StateHelper {
  private static state: DoctorState | null = null;
  private static loaded = false;

  /** Compute a SHA-256 hex digest of the given string content. */
  public static hashContent(content: string): string {
    return createHash("sha256").update(content, "utf-8").digest("hex");
  }

  /**
   * Download the state file from SharePoint.
   * Returns an empty state if the file does not exist yet.
   */
  public static async load(webUrl: string, assetLibrary: string): Promise<void> {
    StateHelper.loaded = true;
    const relUrl = FileHelpers.getRelUrl(webUrl, `${assetLibrary}/${STATE_FOLDER}/${STATE_FILE}`);

    try {
      const { stdout } = await executeWithRetry(
        "spo file get",
        {
          webUrl,
          url: relUrl,
          asString: true,
        },
        CliCommand.getRetry()
      );

      if (stdout) {
        const parsed = JSON.parse(typeof stdout === "string" ? stdout : JSON.stringify(stdout));
        if (parsed && parsed.version) {
          StateHelper.state = parsed as DoctorState;
          Logger.debug(`State loaded: ${Object.keys(StateHelper.state.pages).length} pages`);
          return;
        }
      }
    } catch {
      // File not found — first run; start with empty state
    }

    StateHelper.state = {
      version: 1,
      site: webUrl,
      configHash: null,
      pages: {},
    };
    Logger.debug("No existing state file found — starting fresh.");
  }

  /**
   * Returns true if the file at the given slug has changed since the last publish.
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
  }

  /**
   * Upload the updated state back to SharePoint.
   */
  public static async save(webUrl: string, assetLibrary: string): Promise<void> {
    if (!StateHelper.state) return;

    const json = JSON.stringify(StateHelper.state, null, 2);
    const tmpPath = join(tmpdir(), `doctor-state-${Date.now()}.json`);

    try {
      await writeFileAsync(tmpPath, json, { encoding: "utf-8" });

      // Ensure the .doctor folder exists
      const folderPath = `${assetLibrary}/${STATE_FOLDER}`;
      const folderUrl = FileHelpers.getRelUrl(webUrl, folderPath);
      try {
        await executeWithRetry(
          "spo folder add",
          { webUrl, parentFolderUrl: assetLibrary, name: STATE_FOLDER },
          CliCommand.getRetry()
        );
      } catch {
        // Folder already exists — ignore
      }

      await executeWithRetry(
        "spo file add",
        {
          webUrl,
          folder: folderPath,
          path: tmpPath,
          nameFile: STATE_FILE,
        },
        CliCommand.getRetry()
      );

      Logger.debug(`State saved to SharePoint: ${folderUrl}/${STATE_FILE}`);
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
  }
}
