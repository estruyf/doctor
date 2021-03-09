import { MarkdownSettings, Menu, SiteDesign } from ".";
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
  debug: boolean;
  continueOnError: boolean;
  retryWhenFailed: boolean;
  disableTracking: boolean;

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
}