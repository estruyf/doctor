import { PageLocalization, HeaderOptions, MenuType } from ".";

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
  metadata?: { [name: string]: string };
  author?: any;
  type?: "translation";
}