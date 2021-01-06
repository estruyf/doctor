import { MenuItem } from "./Menu";

export interface PageFrontMatter {
  title: string;

  slug?: string;
  draft?: boolean;
  comments?: boolean;
  menu?: MenuItem;
}