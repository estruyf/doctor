

export class StatusHelper {
  private static instance: StatusHelper;

  private constructor(public pages = 0, public images = 0, public retries = 0) {}

  public static getInstance() {
    if (!StatusHelper.instance) {
      StatusHelper.instance = new StatusHelper();
    }

    return StatusHelper.instance;
  }

  public static addRetry() {
    ++StatusHelper.getInstance().retries;
  }

  public static addImage() {
    ++StatusHelper.getInstance().images;
  }

  public static addPage() {
    ++StatusHelper.getInstance().pages;
  }

  public static getRetries() {
    return StatusHelper.getInstance().retries;
  }

  public static getImages() {
    return StatusHelper.getInstance().images;
  }

  public static getPages() {
    return StatusHelper.getInstance().pages;
  }
}