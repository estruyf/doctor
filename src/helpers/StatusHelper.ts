
export class StatusHelper {
  private static instance: StatusHelper;

  private constructor(
    public pagesCreated = 0,
    public pagesUpdated = 0,
    public pagesSkipped = 0,
    public errors = 0,
    public imagesUploaded = 0,
    public imagesSkipped = 0,
    public retries = 0,
    public pageDurations: { filePath: string; durationMs: number }[] = [],
    public failedFiles: string[] = [],
  ) {}

  public static getInstance() {
    if (!StatusHelper.instance) {
      StatusHelper.instance = new StatusHelper();
    }
    return StatusHelper.instance;
  }

  public static reset() {
    StatusHelper.instance = new StatusHelper();
  }

  public static addRetry() {
    ++StatusHelper.getInstance().retries;
  }

  public static addImage() {
    ++StatusHelper.getInstance().imagesUploaded;
  }

  public static addImageSkipped() {
    ++StatusHelper.getInstance().imagesSkipped;
  }

  public static addPageCreated() {
    ++StatusHelper.getInstance().pagesCreated;
  }

  public static addPageUpdated() {
    ++StatusHelper.getInstance().pagesUpdated;
  }

  public static addPageSkipped() {
    ++StatusHelper.getInstance().pagesSkipped;
  }

  public static addPagesSkipped(count: number) {
    if (count <= 0) {
      return;
    }
    StatusHelper.getInstance().pagesSkipped += count;
  }

  public static addError(filePath?: string) {
    ++StatusHelper.getInstance().errors;

    // Keep track of which files failed, so the summary can list them when
    // running with --continueOnError.
    if (filePath) {
      StatusHelper.getInstance().failedFiles.push(filePath);
    }
  }

  /** @deprecated Use addPageCreated / addPageUpdated instead. */
  public static addPage() {
    ++StatusHelper.getInstance().pagesUpdated;
  }

  public static getRetries() {
    return StatusHelper.getInstance().retries;
  }

  public static getImages() {
    return StatusHelper.getInstance().imagesUploaded;
  }

  public static getImagesSkipped() {
    return StatusHelper.getInstance().imagesSkipped;
  }

  public static getPages() {
    return (
      StatusHelper.getInstance().pagesCreated +
      StatusHelper.getInstance().pagesUpdated
    );
  }

  public static getPagesCreated() {
    return StatusHelper.getInstance().pagesCreated;
  }

  public static getPagesUpdated() {
    return StatusHelper.getInstance().pagesUpdated;
  }

  public static getPagesSkipped() {
    return StatusHelper.getInstance().pagesSkipped;
  }

  public static getErrors() {
    return StatusHelper.getInstance().errors;
  }

  public static getFailedFiles() {
    return StatusHelper.getInstance().failedFiles;
  }

  public static addPageDuration(filePath: string, durationMs: number) {
    StatusHelper.getInstance().pageDurations.push({ filePath, durationMs });
  }

  public static getPageTimingStats() {
    const durations = StatusHelper.getInstance().pageDurations;
    if (!durations || durations.length === 0) {
      return null;
    }

    let slowest = durations[0];
    let fastest = durations[0];
    let total = 0;

    for (const duration of durations) {
      total += duration.durationMs;
      if (duration.durationMs > slowest.durationMs) {
        slowest = duration;
      }
      if (duration.durationMs < fastest.durationMs) {
        fastest = duration;
      }
    }

    return {
      count: durations.length,
      averageMs: total / durations.length,
      slowest,
      fastest,
    };
  }
}
