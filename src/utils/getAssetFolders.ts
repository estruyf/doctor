import { createHash } from "crypto";

/**
 * Where an asset from outside the content folder is uploaded. It has no place
 * in the content structure, so they share one folder rather than each getting a
 * copy of the absolute path of whoever ran the publish.
 */
export const ASSETS_FALLBACK_FOLDER = "assets";

const normalize = (value: string): string =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const segments = (value: string): string[] =>
  value.split("/").filter(Boolean);

/** Enough of a digest to tell two folders apart, short enough to read */
const shortHash = (value: string): string =>
  createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 8);

/**
 * The folders an asset gets inside the asset library.
 *
 * An asset that lives in the content folder keeps the structure it has there,
 * so `docs/guides/img/logo.png` ends up in `guides/img`. An asset referenced
 * from outside it — `../assets/logo.png` from the top of the content folder,
 * for instance — has no such structure to mirror, and taking its path literally
 * would upload it to `Users/<name>/repos/...`: the machine's own directory
 * tree, which means nothing on SharePoint and differs per person.
 *
 * Those go under a shared `assets` folder, but they keep their path relative to
 * the project — the folder `doctor.json` is run from — because collapsing every
 * outside folder onto `assets` alone made `../shared/brand/logo.png` and
 * `../other/brand/logo.png` the same file, so whichever was published second
 * either overwrote the first or was skipped, and both pages showed one image.
 * A folder outside the project too has nothing left to mirror, and gets a digest
 * of its path so it still cannot collide with anything else.
 *
 * @param startFolder the content folder being published
 * @param assetDirectory the folder the asset itself sits in
 * @param root the project folder, which paths outside the content folder are
 * kept relative to
 */
export const getAssetFolders = (
  startFolder: string,
  assetDirectory: string,
  root: string = process.cwd(),
): string[] => {
  const start = normalize(startFolder);
  const directory = normalize(assetDirectory);

  if (!start || directory === start) {
    return [];
  }

  if (directory.startsWith(`${start}/`)) {
    return segments(directory.slice(start.length + 1));
  }

  const base = normalize(root || "");

  if (base && directory === base) {
    return [ASSETS_FALLBACK_FOLDER];
  }

  if (base && directory.startsWith(`${base}/`)) {
    return [
      ASSETS_FALLBACK_FOLDER,
      ...segments(directory.slice(base.length + 1)),
    ];
  }

  return [ASSETS_FALLBACK_FOLDER, shortHash(directory)];
};
