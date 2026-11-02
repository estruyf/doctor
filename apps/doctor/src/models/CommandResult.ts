/**
 * The shapes written to stdout when a command runs with `--output json`.
 *
 * These are a contract: a pipeline gates on them, so a property is added
 * rather than renamed or removed.
 */

export interface CommandResult {
  command: string | null;
  /**
   * Whether the command did what it was asked to do. A publish which continued
   * after a failing page (`--continueOnError`) reports `false` here, while the
   * process still exits with code 0.
   */
  success: boolean;
  version: string | null;
  warnings?: string[];
  error?: {
    message: string;
  };
}

export interface StatusResultPage {
  /**
   * The path of the markdown file, relative to the current working directory.
   * `null` for a page which only exists in the publish state.
   */
  file: string | null;
  /**
   * The slug the page is published under. `null` for a language file no page
   * refers to, as it never gets published.
   */
  slug: string | null;
}

export interface StatusResult extends CommandResult {
  url: string;
  state: {
    /**
     * Whether the publish state is used. All pages are reported as new when it
     * is disabled with `--disableStatePersistence`.
     */
    enabled: boolean;
    /** The number of pages tracked in the publish state. */
    tracked: number;
    /** The number of local markdown files which were compared. */
    filesChecked: number;
  };
  summary: {
    new: number;
    modified: number;
    unchanged: number;
    deleted: number;
    orphaned: number;
    /** New + modified: the pages the next publish run will process. */
    changed: number;
    /** `true` when nothing is left to publish or to remove. */
    upToDate: boolean;
  };
  pages: {
    new: StatusResultPage[];
    modified: StatusResultPage[];
    unchanged: StatusResultPage[];
    deleted: StatusResultPage[];
    orphaned: StatusResultPage[];
  };
}

export interface PublishResultTiming {
  file: string;
  durationMs: number;
}

export interface PublishResult extends CommandResult {
  url: string;
  summary: {
    pages: {
      total: number;
      created: number;
      updated: number;
      skipped: number;
      removed: number;
    };
    images: {
      total: number;
      uploaded: number;
      skipped: number;
    };
    retries: number;
    errors: number;
    durationMs: number;
  };
  /** The files which failed to publish. Only filled when the run continued. */
  failedFiles: string[];
  /** Per page timings, only present when `--timingDetails` is used. */
  timings?: {
    count: number;
    averageMs: number;
    fastest: PublishResultTiming;
    slowest: PublishResultTiming;
  };
}
