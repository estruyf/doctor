/**
 * Where an asset from outside the content folder is uploaded. It has no place
 * in the content structure, so all of them share one folder rather than each
 * getting a copy of the absolute path of whoever ran the publish.
 */
export const ASSETS_FALLBACK_FOLDER = "assets";

const normalize = (value: string): string =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * The folders an asset gets inside the asset library.
 *
 * An asset that lives in the content folder keeps the structure it has there,
 * so `docs/guides/img/logo.png` ends up in `guides/img`. An asset referenced
 * from outside it — `../assets/logo.png` from the top of the content folder,
 * for instance — has no such structure to mirror, and taking its path
 * literally would upload it to `Users/<name>/repos/...`: the machine's own
 * directory tree, which means nothing on SharePoint and differs per person.
 * Those go in one shared folder instead.
 *
 * @param startFolder the content folder being published
 * @param assetDirectory the folder the asset itself sits in
 */
export const getAssetFolders = (
  startFolder: string,
  assetDirectory: string,
): string[] => {
  const start = normalize(startFolder);
  const directory = normalize(assetDirectory);

  if (!start || directory === start) {
    return [];
  }

  if (!directory.startsWith(`${start}/`)) {
    return [ASSETS_FALLBACK_FOLDER];
  }

  return directory
    .slice(start.length + 1)
    .split("/")
    .filter(Boolean);
};
