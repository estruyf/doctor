import { MenuItem } from "./Menu";

export interface PageFrontMatter {
  title: string;

  slug?: string;
  draft?: boolean;
  menu?: MenuItem;
}