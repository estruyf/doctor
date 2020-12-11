import { Menu } from "./Menu";

export interface CommandArguments {
  task: string;
  auth: "deviceCode" | "password";
  startFolder: string;
  assetLibrary: string;
  webPartTitle: string;
  webUrl: string;
  overwriteImages: boolean;

  menu?: Menu;

  username?: string;
  password?: string;
}