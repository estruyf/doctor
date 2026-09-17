/** A relative link, split into the file it points at and what follows it */
export interface LinkTarget {
  /** The path, with any `#fragment` and `?query` removed */
  path: string;
  /** The `#fragment` and/or `?query`, ready to put back on the rewritten URL */
  suffix: string;
}

/**
 * Take a link apart before resolving it to a page.
 *
 * `./page.md#section` is a link to `./page.md`, but testing the whole string
 * for a `.md` ending says otherwise — so it used to be treated as an
 * extensionless link and turned into `./page.md#section.md`, a file which
 * never exists. The page it pointed at was then neither rewritten to its
 * SharePoint URL (the published page kept a relative markdown path, which is
 * a dead link on the site) nor recorded as something the page depends on (so
 * renaming the target left every link to it stale).
 *
 * The suffix is handed back rather than dropped, because it belongs on the
 * rewritten URL: an anchor into a long page is the whole point of writing one.
 */
export const splitLinkTarget = (href: string): LinkTarget => {
  const at = (value: string, marker: string) => {
    const index = value.indexOf(marker);
    return index === -1 ? value.length : index;
  };

  const cut = Math.min(at(href, "#"), at(href, "?"));

  return { path: href.slice(0, cut), suffix: href.slice(cut) };
};
