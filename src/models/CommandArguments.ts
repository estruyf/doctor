import {
  MarkdownSettings,
  Menu,
  MultilingualSettings,
  SiteDesign,
} from "./index.js";
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
  skipExistingPages: boolean;
  skipUnchanged: boolean;
  debug: boolean;
  continueOnError: boolean;
  retryWhenFailed: boolean;

  disableComments: boolean;

  skipPages: boolean;
  skipNavigation: boolean;
  skipSiteDesign: boolean;

  cleanEnd: boolean;
  cleanStart: boolean;
  confirm: boolean;

  cleanQuickLaunch: boolean;
  cleanTopNavigation: boolean;

  pageTemplate: string | null;

  menu?: Menu;
  multilingual?: MultilingualSettings | null;

  username?: string;
  password?: string;
  outputFolder?: string;
  tenant?: string;
  appId?: string;
  certificateBase64Encoded?: string;
  commandName?: string;
  siteDesign?: SiteDesign;
  markdown?: MarkdownSettings;
  shortcodesFolder?: string;

  tocLevels: number[];
}
