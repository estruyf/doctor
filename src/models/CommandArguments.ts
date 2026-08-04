import {
  MarkdownSettings,
  Menu,
  MultilingualSettings,
  SiteDesign,
} from "./index.js";

export interface RuntimeOptions {
  task: string | null;
  commandName?: string;
  commandTimeout?: number | null;
  debug: boolean;
  verbose: boolean;
  timingDetails: boolean;
  continueOnError: boolean;
  retryWhenFailed: boolean;
  confirm: boolean;
}

export interface AuthOptions {
  auth: "deviceCode" | "password" | "certificate";
  username?: string;
  password?: string;
  tenant?: string;
  appId?: string;
  certificateBase64Encoded?: string;
}

export interface PublishOptions {
  startFolder: string;
  startFolderRel: string;
  outputFolder?: string;
  assetLibrary: string;
  stateFile: string;
  disableStatePersistence: boolean;
  webPartTitle: string;
  webUrl: string;
  overwriteImages: boolean;
  skipPrecheck: boolean;
  skipExistingPages: boolean;
  forceAll: boolean;
  pageTemplate: string | null;
}

export interface ContentOptions {
  markdown?: MarkdownSettings;
  shortcodesFolder?: string;
  tocLevels: number[];
  disableComments: boolean;
}

export interface NavigationOptions {
  menu?: Menu;
  cleanQuickLaunch: boolean;
  cleanTopNavigation: boolean;
}

export interface SiteOptions {
  multilingual?: MultilingualSettings | null;
  siteDesign?: SiteDesign;
}

export interface TaskToggleOptions {
  skipPages: boolean;
  skipNavigation: boolean;
  skipSiteDesign: boolean;
  applyTheme: boolean;
  cleanEnd: boolean;
  cleanStart: boolean;
}

export type CommandArguments = RuntimeOptions &
  AuthOptions &
  PublishOptions &
  ContentOptions &
  NavigationOptions &
  SiteOptions &
  TaskToggleOptions;
