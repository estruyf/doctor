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
  skipExistingPages: boolean;
  debug: boolean;
  cleanStart: boolean;
  confirm: boolean;
  continueOnError: boolean;

  menu?: Menu;

  username?: string;
  password?: string;
  outputFolder?: string;
}