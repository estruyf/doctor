import { toComparablePath } from "@utils";
import { PageFrontMatter } from "@models";
import { CliCommand } from "./CliCommand.js";

export class FrontMatterHelper {
  /**
   * The extension of the pages this run publishes: modern pages are `.aspx`,
   * HTML pages `.html`. Read from the run's options, so every place that turns
   * a markdown file into a page URL agrees on it without passing it around.
   */
  public static getPageExtension(): "aspx" | "html" {
    return CliCommand.options?.pageMode === "html" ? "html" : "aspx";
  }

  /**
   * The folder in Site Pages every page of this run goes in (`pagesFolder`),
   * without leading or trailing slashes. Empty when pages go in the root.
   */
  public static getPagesFolder(): string {
    return CliCommand.options?.pagesFolder || "";
  }

  /**
   * Whether a slug sits inside the configured `pagesFolder`, compared without
   * regard to case as SharePoint URLs are. Always true without a folder, as
   * the whole of Site Pages is then doctor's to publish in.
   * @param slug A page URL relative to Site Pages, like `docs/page.aspx`
   */
  public static isInPagesFolder(slug: string): boolean {
    const folder = FrontMatterHelper.getPagesFolder();
    if (!folder) {
      return true;
    }

    return (slug || "")
      .replace(/^\/+/, "")
      .toLowerCase()
      .startsWith(`${folder.toLowerCase()}/`);
  }

  /**
   * Retrieve the Slug for the page
   * @param data
   */
  public static getSlug(
    data: PageFrontMatter,
    startFolder: string,
    filePath: string
  ): string {
    let { slug, title } = data;

    // Both sides are brought to one form first. They are written differently
    // depending on where they came from — the configured folder, fast-glob, or
    // path.join — and stripping one out of the other by plain text match only
    // worked when they happened to agree: a content folder written as `src`
    // rather than `./src` left a `./` at the front of every page URL.
    // Rooted at the working directory, so a relative folder and an absolute
    // file path (or the other way round) still describe the same place
    const root = process.cwd().replace(/\\/g, "/");
    const uniStartPath = toComparablePath(startFolder, root);
    const uniFilePath = toComparablePath(filePath, root);
    const pathSlug = (
      uniStartPath && uniFilePath.startsWith(`${uniStartPath}/`)
        ? uniFilePath.slice(uniStartPath.length + 1)
        : uniFilePath
    ).split("/");
    pathSlug.pop();
    const spFilePath = pathSlug.filter((s) => s).join("/");

    const extension = FrontMatterHelper.getPageExtension();

    if (!slug) {
      slug = `${spFilePath ? `${spFilePath}/` : ""}${title
        .replace(/\//g, "-")
        .replace(/ /g, "-")
        .toLowerCase()}.${extension}`;
    } else if (extension === "html") {
      // A slug written for a modern page names the same page, so switching
      // modes does not mean editing every front matter `slug`
      slug = `${(slug as string).replace(/\.(aspx|html)$/i, "")}.html`;
    } else if (!(slug as string).endsWith(".aspx")) {
      slug = `${slug}.aspx`;
    }

    // Applied here, so everything built from the slug — the page URL, links
    // between pages, the state file, the menu, the homepage — moves with it.
    // A front matter slug that already names the folder is left alone, so a
    // site which prefixed its slugs by hand can switch to the setting without
    // editing them all first. A path slug always gets it: there the folder is
    // a content folder that happens to share the name, and leaving it out
    // would give `docs/page.md` and `page.md` the same page.
    const pagesFolder = FrontMatterHelper.getPagesFolder();
    if (pagesFolder && !(data.slug && FrontMatterHelper.isInPagesFolder(slug))) {
      slug = `${pagesFolder}/${(slug as string).replace(/^\/+/, "")}`;
    }

    return slug;
  }
}
