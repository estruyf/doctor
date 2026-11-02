import axios from 'axios';

/**
 * Wraps a Graph/SharePoint REST axios error with the HTTP status and endpoint
 * URL so failures are always actionable in the UI (see TermStoreService's
 * matching pattern) instead of surfacing as an opaque "Request failed with
 * status code 4xx" with no indication of which call or resource failed.
 */
/** What the picker shows for one search */
const SITE_USER_SEARCH_LIMIT = 10;
/**
 * What is asked of SharePoint, before the claims-prefix matches are dropped.
 *
 * Wider than the limit so that narrowing has something left to show. It does
 * not make the problem go away: SharePoint applies `$top` before doctor sees
 * anything, so on a site with hundreds of users a two-character term that hits
 * `membership` can still fill the page with prefix-only matches and bury the
 * person being looked for. Typing one more character is what fixes that, and
 * it is the common case this width is sized for.
 */
const SITE_USER_SEARCH_FETCH = 50;

function enrichGraphError(error: any, url: string): Error {
  const status = error?.response?.status;
  const statusText = error?.response?.statusText;
  const bodyMessage = error?.response?.data?.error?.message || error?.response?.data?.['odata.error']?.message?.value;
  const detail = [status ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}` : null, bodyMessage]
    .filter(Boolean)
    .join(' — ');
  return new Error(`Request to ${url} failed${detail ? ` (${detail})` : `: ${error?.message ?? error}`}`);
}

export class GraphClient {
  constructor(
    private getSharePointToken: (siteUrl: string) => Promise<string | null>
  ) {}

  private async getSpToken(siteUrl: string): Promise<string> {
    const spToken = await this.getSharePointToken(siteUrl);
    if (!spToken) {
      throw new Error('Not signed in to SharePoint. Run "Doctor: Sign in to Microsoft 365 (fallback)".');
    }
    return spToken;
  }

  async getTermsRecursive(setId: string, siteUrl: string, anchorId?: string): Promise<any[]> {
    const normalizedSetId = (setId || '').trim();
    if (!normalizedSetId) {
      throw new Error('Cannot fetch terms: term set id is missing');
    }
    // Always uses the SharePoint REST API — it supports anchor-scoped
    // fetching and works for both site and tenant term stores. This client
    // no longer calls Microsoft Graph at all: schema, taxonomy, and user
    // search (searchSiteUsers()) are all site-scoped SharePoint REST calls.
    return this.fetchTermsRecursiveRest(siteUrl, normalizedSetId, anchorId);
  }

  private async fetchTermsRecursiveRest(siteUrl: string, termSetId: string, parentId?: string): Promise<any[]> {
    const children = await this.getTermsBySetIdRest(siteUrl, termSetId, parentId);
    const result: any[] = [];
    for (const child of children) {
      // Tag this child with its parent so TermStoreService can build the tree
      result.push({ ...child, _parentId: parentId });
      // Recurse — descendants already carry their own _parentId from deeper calls
      const descendants = await this.fetchTermsRecursiveRest(siteUrl, termSetId, child.id);
      result.push(...descendants);
    }
    return result;
  }

  async getTermsBySetIdRest(siteUrl: string, termSetId: string, anchorId?: string): Promise<any[]> {
    const token = await this.getSpToken(siteUrl);
    const base = siteUrl.replace(/\/$/, '');
    const encodedSetId = encodeURIComponent(termSetId);

    // If an anchor term is specified, fetch only its descendants directly.
    // Otherwise fetch top-level children of the set.
    let url: string;
    if (anchorId) {
      const encodedAnchorId = encodeURIComponent(anchorId);
      url = `${base}/_api/v2.1/termStore/sets/${encodedSetId}/terms/${encodedAnchorId}/children?$select=id,labels,isDeprecated`;
    } else {
      url = `${base}/_api/v2.1/termStore/sets/${encodedSetId}/children?$select=id,labels,isDeprecated`;
    }

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      return response.data?.value || [];
    } catch (error: any) {
      // Unlike the other SharePoint REST calls in this file, this one
      // previously let the raw axios error propagate — losing the HTTP
      // status/response-body detail enrichGraphError adds, which is why
      // "failed to load terms" errors could show up with no actionable
      // detail.
      throw enrichGraphError(error, url);
    }
  }

  /**
   * Searches the site's own User Information List for a matching user via
   * SharePoint's REST API. This is the only user-search call this extension
   * makes now: rather than resolving Person/Group field values against the
   * whole tenant via Microsoft Graph, every Person/Group field — including
   * the reserved Author column (AuthorId) — is scoped to users already
   * known to this specific site (granted access via a SharePoint group or
   * direct permission, whether or not they've ever signed in). This matches
   * how those fields are actually used in practice and means this extension
   * has no Microsoft Graph dependency at all.
   */
  /**
   * The languages the site can be switched to, as SharePoint lists them.
   *
   * What `multilingual.languages` may enable, straight from the source rather
   * than from a copy of it — so a language Microsoft adds shows up here before
   * anybody updates a list.
   */
  async getInstalledLanguages(siteUrl: string): Promise<any> {
    const token = await this.getSpToken(siteUrl);
    const url = `${siteUrl.replace(/\/$/, '')}/_api/web/RegionalSettings/InstalledLanguages`;
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;odata=nometadata',
        },
      });
      return response.data;
    } catch (error: any) {
      throw enrichGraphError(error, url);
    }
  }

  async searchSiteUsers(siteUrl: string, query: string): Promise<any[]> {
    const term = query.trim();
    // `UserService` measures the query before trimming, so two spaces get this
    // far. An empty term makes it a `substringof('', ...)` — a substring of
    // everything — and hands the picker ten arbitrary people. Checked before
    // the token is fetched: there is no call to authenticate for.
    if (!term) {
      return [];
    }

    const token = await this.getSpToken(siteUrl);
    const base = siteUrl.replace(/\/$/, '');

    // Escape single quotes per OData convention (doubled). The term is left as
    // typed: SharePoint compares text with a case-insensitive collation, so
    // substringof already matches "Tommy" for "tommy".
    //
    // It is not wrapped in tolower() — SharePoint's OData implementation has no
    // such function, and asking for it fails the whole request with "The
    // function operator 'tolower' is not supported or its usage is invalid."
    // rather than degrading to a case-sensitive match.
    const escaped = term.replace(/'/g, "''");
    // Matched on LoginName rather than Email: the login name carries the
    // address people actually sign in with, while Email is a profile value
    // which is often empty or stale. It is also what every caller reads the
    // UPN out of.
    //
    // PrincipalType eq 1 restricts results to real users (2=Distribution
    // List, 4=Security Group, 8=SharePoint Group).
    const filter = `(substringof('${escaped}',Title) or substringof('${escaped}',LoginName)) and PrincipalType eq 1`;
    // More than the caller needs, because the matches are narrowed again below
    const url = `${base}/_api/web/siteusers?$filter=${encodeURIComponent(filter)}&$select=Id,Title,Email,LoginName&$top=${SITE_USER_SEARCH_FETCH}`;
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;odata=nometadata'
        }
      });
      return GraphClient.narrowUserMatches(response.data?.value || [], term);
    } catch (error: any) {
      throw enrichGraphError(error, url);
    }
  }

  /**
   * Drop the users who only matched inside the claims prefix.
   *
   * A login name is stored as `i:0#.f|membership|user@tenant.com`, so a search
   * for `me`, `be` or `hip` matches the `membership` in every user on the site
   * and buries whoever was actually being looked for. Only the part of the
   * login name that identifies the person counts, which is everything after
   * the last `|` — the same part every caller reads the UPN out of.
   */
  private static narrowUserMatches(users: any[], term: string): any[] {
    const wanted = term.toLowerCase();

    return users
      .filter((user) => {
        const login: string = user?.LoginName || '';
        const identity = login.includes('|')
          ? login.slice(login.lastIndexOf('|') + 1)
          : login;

        return (
          `${user?.Title || ''}`.toLowerCase().includes(wanted) ||
          identity.toLowerCase().includes(wanted)
        );
      })
      .slice(0, SITE_USER_SEARCH_LIMIT);
  }

  /**
   * Returns the Site Pages library's REST path via GetList(), addressed by
   * its fixed server-relative URL rather than getbytitle('Site Pages') —
   * the list's Title is a localized display value (a site with a non-English
   * language pack renders it as something other than "Site Pages"), which
   * would silently break getbytitle() lookups on those sites. The list's
   * URL segment ("SitePages") is set once at creation and is never
   * localized, so GetList() is the only reliably language-independent way
   * to address it.
   */
  private sitePagesListPath(siteUrl: string): string {
    const serverRelativeUrl = new URL(siteUrl).pathname.replace(/\/$/, '');
    return `GetList('${serverRelativeUrl}/SitePages')`;
  }

  /**
   * Fetches the Site Pages library's field definitions via SharePoint REST,
   * matching getTaxonomyFields(). Avoid Graph's /sites/{id}/lists + /columns
   * here: that endpoint silently omits system lists unless `system` is
   * explicitly requested in $select, and it still does not return the
   * taxonomy details this extension needs. Everything in this client is now
   * site-scoped SharePoint REST.
   */
  async getSitePageListFields(siteUrl: string): Promise<any[]> {
    const restUrl = `${siteUrl}/_api/web/${this.sitePagesListPath(siteUrl)}/fields?$select=InternalName,Title,Description,TypeAsString,Required,Hidden,Choices,AllowMultipleValues`;
    const token = await this.getSpToken(siteUrl);
    try {
      const response = await axios.get(restUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;odata=nometadata'
        }
      });
      return response.data?.value || [];
    } catch (error: any) {
      throw enrichGraphError(error, restUrl);
    }
  }

  /**
   * Fetches taxonomy field details including TermSetId via the SharePoint REST API.
   * The Graph API columns endpoint does not return termSet.id (documented omission).
   */
  async getTaxonomyFields(siteUrl: string): Promise<Record<string, { termSetId: string; typeAsString: string; anchorId?: string }>> {
    const restUrl = `${siteUrl}/_api/web/${this.sitePagesListPath(siteUrl)}/fields?$filter=TypeAsString eq 'TaxonomyFieldType' or TypeAsString eq 'TaxonomyFieldTypeMulti'&$select=InternalName,TermSetId,TypeAsString,AnchorId`;
    const token = await this.getSpToken(siteUrl);
    let response;
    try {
      response = await axios.get(restUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;odata=nometadata'
        }
      });
    } catch (error: any) {
      throw enrichGraphError(error, restUrl);
    }
    const fields: Record<string, { termSetId: string; typeAsString: string; anchorId?: string }> = {};
    for (const field of response.data.value || []) {
      if (field.InternalName && field.TermSetId) {
        const anchorId = field.AnchorId && field.AnchorId !== '00000000-0000-0000-0000-000000000000' ? field.AnchorId : undefined;
        fields[field.InternalName] = { termSetId: field.TermSetId, typeAsString: field.TypeAsString, anchorId };
      }
    }
    return fields;
  }
}
