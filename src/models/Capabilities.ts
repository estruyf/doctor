/**
 * What the account running the publish is allowed to do on the site.
 *
 * Doctor used to find this out by trying each operation in turn, so a missing
 * permission surfaced as a failure from whichever step happened to need it
 * first — sometimes after every page had already been written. These are
 * probed once, before anything is written.
 */
export interface Capabilities {
  /** Whether the probe could run at all. When false, everything is attempted. */
  determined: boolean;
  /** Create and update pages in the Site Pages library — the publish itself */
  publishPages: boolean;
  /** Set page columns, which is a list item update */
  setMetadata: boolean;
  /** Update a page without creating a version, used for the description */
  systemUpdate: boolean;
  /** Quick launch and top navigation */
  manageNavigation: boolean;
  /** Theme, header and footer, and the site logo */
  manageSiteDesign: boolean;
  /** Upload images and the publish state to the asset library */
  writeAssets: boolean;
  /** Resolve managed metadata labels */
  readTermStore: boolean;
  /** Resolve the `author` front matter */
  readSiteUsers: boolean;
}

/**
 * The bit each SharePoint permission occupies in the 64-bit
 * `EffectiveBasePermissions` mask, counted from 1.
 */
export const PERMISSION_BITS = {
  viewListItems: 1,
  addListItems: 2,
  editListItems: 3,
  deleteListItems: 4,
  openItems: 6,
  manageLists: 12,
  manageWeb: 31,
} as const;

export type PermissionName = keyof typeof PERMISSION_BITS;

/** The `{ High, Low }` pair SharePoint returns for a permission mask */
export interface PermissionMask {
  High: string | number;
  Low: string | number;
}
