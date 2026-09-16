/** A path already rooted somewhere, rather than relative to where doctor runs */
const isAbsolute = (value: string): boolean =>
  value.startsWith("/") || /^[a-zA-Z]:\//.test(value);

/**
 * One comparable form for the paths doctor holds.
 *
 * They arrive written several ways and are then compared against each other:
 * `--folder` keeps whatever was configured (`./src` by default, but `src` and
 * an absolute path are just as valid), the file list comes from fast-glob,
 * which preserves the `./` of the pattern it was given, and anything built with
 * `path.join` has had that `./` stripped. Comparing two of those directly is a
 * coin toss — it is why every image in the content folder was once taken for
 * one outside it, and why a content folder written without `./` produced page
 * URLs with a `./` in them.
 *
 * Nothing here touches the filesystem: it is string normalisation, so it stays
 * testable and costs nothing per page.
 *
 * @param value the path to normalise
 * @param root what a relative path is relative to; when empty the path is left
 * relative, which is enough to compare two paths written the same way
 */
export const toComparablePath = (value: string, root: string = ""): string => {
  // Repeated separators are collapsed before anything is stripped: doing it the
  // other way round turns `.//src` into `/src`, which then reads as a path
  // rooted at the drive rather than one relative to the project.
  let path = (value || "")
    .replace(/\\/g, "/")
    .replace(/(?<!^)\/{2,}/g, "/")
    .replace(/\/+$/, "");

  while (path.startsWith("./")) {
    path = path.slice(2);
  }

  if (!path || path === ".") {
    return root;
  }

  return isAbsolute(path) ? path : root ? `${root}/${path}` : path;
};
