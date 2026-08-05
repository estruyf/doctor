import {
  MarkdownSettings,
  Menu,
  MultilingualSettings,
  PartialsSettings,
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
  auth: "certificate";
  /**
   * The password of the certificate file, when it is protected with one.
   */
  password?: string;
  tenant?: string;
  appId?: string;
  /**
   * Path to the certificate file (`.pfx`, `.p12`, or `.pem`), or its base64
   * encoded contents.
   */
  certificate?: string;
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
  partials?: PartialsSettings | null;
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
