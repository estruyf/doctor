import { Menu } from "./Menu";

export interface CommandArguments {
  task: string;
  auth: "deviceCode" | "password" | "certificate";
  startFolder: string;
  startFolderRel: string;
  assetLibrary: string;
  webPartTitle: string;
  webUrl: string;
  overwriteImages: boolean;
  skipPrecheck: boolean;
  debug: boolean;
  cleanStart: boolean;
  confirm: boolean;

  menu?: Menu;

  username?: string;
  password?: string;
  outputFolder?: string;
  tenant?: string;
  appId?: string;
  certificateBase64Encoded?: string;
}