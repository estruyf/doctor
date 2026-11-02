import type { FrontMatterKey } from "@estruyf/doctor-common";
import { PageLocalization, HeaderOptions, MenuType, PagePartials } from "./index.js";

export interface PageFrontMatter {
  title: string;

  description?: string;
  slug?: string;
  draft?: boolean;
  /** Make this page the site's homepage */
  homepage?: boolean;
  comments?: boolean;
  header?: HeaderOptions;
  menu?: MenuType;
  template?: string;
  layout?: string;
  localization?: PageLocalization;
  metadata?: { [name: string]: any };
  partials?: PagePartials;
  author?: any;
  type?: "translation";
}

/**
 * Fails to compile when a key is added to the interface above but not to the
 * shared list the extension edits, or the other way around.
 */
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type FrontMatterKeysAreShared = Assert<SameKeys<keyof PageFrontMatter, FrontMatterKey>>;
