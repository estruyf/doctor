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
    return slug;
  }
}
