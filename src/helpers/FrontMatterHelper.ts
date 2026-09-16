import { toComparablePath } from "@utils";
import { PageFrontMatter } from "@models";

export class FrontMatterHelper {
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

    if (!slug) {
      slug = `${spFilePath ? `${spFilePath}/` : ""}${title
        .replace(/\//g, "-")
        .replace(/ /g, "-")
        .toLowerCase()}.aspx`;
    } else if (!(slug as string).endsWith(".aspx")) {
      slug = `${slug}.aspx`;
    }
    return slug;
  }
}
