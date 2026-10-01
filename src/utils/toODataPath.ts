/**
 * A path made safe to put inside an OData string literal in a URL, like the
 * `sitepages/<slug>` of `GetByUrl('sitepages/<slug>')`.
 *
 * Encoding the path for the URL is not enough on its own: `encodeURIComponent`
 * leaves a `'` as it is, and inside the literal that ends the string early — so
 * a page titled "What's new" became `GetByUrl('sitepages/what's-new.aspx')`,
 * which SharePoint cannot parse, and the page failed to publish. OData escapes
 * a quote by doubling it, which is also what the CLI for Microsoft 365 does.
 *
 * @param path the path, as SharePoint knows it
 * @param keepSlashes encode each segment and keep the `/` between them, for the
 * callers that build the path that way
 */
export const toODataPath = (path: string, keepSlashes: boolean = false): string =>
  (keepSlashes
    ? path.split("/").map((segment) => encodeURIComponent(segment)).join("/")
    : encodeURIComponent(path)
  ).replace(/'/g, "''");
