export interface FieldInfo {
  internalName: string;
  title: string;
  description?: string;
  TypeAsString: string;
  Required: boolean;
  Hidden?: boolean;
  TermSetId?: string;
  AnchorId?: string;
  choices?: string[];
}

export interface TermInfo {
  id: string;
  labels: {
    name: string;
    isDefault: boolean;
    languageTag: string;
  }[];
  isDeprecated: boolean;
  children?: TermInfo[];
  depth?: number;
}

/**
 * A SharePoint site-scoped user (from the site's User Information List),
 * used for fields like `author`/`AuthorId` that require the raw integer ID
 * of a user who is already known to that specific site — unlike custom
 * Person/Group columns, which accept a tenant-wide UPN.
 */
export interface SiteUserInfo {
  id: number;
  displayName: string;
  email?: string;
  loginName: string;
}

export interface TokenResult {
  accessToken: string;
  expiresOn?: Date;
}

export interface SchemaCache {
  siteUrl: string;
  fields: FieldInfo[];
  timestamp: number;
}

export interface TermStoreCache {
  termSetId: string;
  terms: TermInfo[];
  timestamp: number;
}
