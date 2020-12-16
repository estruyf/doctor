import { Menu } from "./Menu";

export interface CommandArguments {
  task: string;
  auth: "deviceCode" | "password";
  startFolder: string;
  startFolderRel: string;
  assetLibrary: string;
  webPartTitle: string;
  webUrl: string;
  overwriteImages: boolean;
  skipPrecheck: boolean;
  debug: boolean;

  menu?: Menu;

  username?: string;
  password?: string;
  outputFolder?: string;
}