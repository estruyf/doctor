import { relative } from "path";

/**
 * Convert an absolute file path to a path relative to the current working
 * directory. Keeps log output short while staying unambiguous for sites that
 * organize content by folder (e.g. multiple `index.md` files).
 *
 * Falls back to the original path when the file lives outside the working
 * directory, so the output never degrades into a `../../../` chain.
 * @param filePath
 */
export const relativePath = (filePath: string): string => {
  if (!filePath) {
    return filePath;
  }

  const rel = relative(process.cwd(), filePath).replace(/\\/g, "/");
  return !rel || rel.startsWith("..") ? filePath : rel;
};
