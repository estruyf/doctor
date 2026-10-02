import { PageLocalization, HeaderOptions, MenuType, PagePartials } from "./index.js";

export interface PageFrontMatter {
  title: string;

  description?: string;
  slug?: string;
  draft?: boolean;
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