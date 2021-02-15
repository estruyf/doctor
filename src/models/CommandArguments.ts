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
  skipExistingPages: boolean;
  debug: boolean;
  cleanStart: boolean;
  confirm: boolean;
  continueOnError: boolean;

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

export interface SiteDesign {
  theme?: string;
  chrome?: Chrome;
}

export interface Chrome {
  headerLayout?: "Standard" | "Compact" | "Minimal" | "Extended";
  headerEmphasis?: "Lightest" | "Light" | "Dark" | "Darker";
  logoAlignment?: "Left" | "Center" | "Right";
  footerLayout?: "Simple" | "Extended";
  footerEmphasis?: "Lightest" | "Light" | "Dark" | "Darker";
  disableMegaMenu?: boolean;
  disableFooter?: boolean;
  hideTitleInHeader?: boolean;
}

export interface MarkdownSettings {
  allowHtml?: boolean;
  theme?: "dark" | "light";
}