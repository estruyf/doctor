export interface PageTemplate {
  AbsoluteUrl: string;
  AuthorByline: string[];
  BannerImageUrl: string;
  BannerThumbnailUrl: string;
  ContentTypeId: string;
  Description: string;
  DoesUserHaveEditPermission: boolean;
  FileName: string;
  FirstPublished: string;
  Id: number;
  IsPageCheckedOutToCurrentUser: boolean;
  IsWebWelcomePage: boolean;
  Modified: string;
  PageLayoutType: string;
  Path: Path;
  PromotedState: number;
  Title: string;
  TopicHeader?: any;
  UniqueId: string;
  Url: string;
  Version: string;
  VersionInfo: VersionInfo;
}

export interface VersionInfo {
  LastVersionCreated: string;
  LastVersionCreatedBy: string;
}

export interface Path {
  DecodedUrl: string;
}