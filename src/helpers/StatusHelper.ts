
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

  public static addError() {
    ++StatusHelper.getInstance().errors;
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
}
