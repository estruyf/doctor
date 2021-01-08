import { HeaderOptions } from "./HeaderOptions";
import { MenuItem } from "./Menu";

export interface PageFrontMatter {
  title: string;

  description?: string;
  slug?: string;
  draft?: boolean;
  comments?: boolean;
  header?: HeaderOptions;
  menu?: MenuItem;
}