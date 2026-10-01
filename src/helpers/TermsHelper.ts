import { AccessToken } from "./AccessToken.js";
import { ApiHelper } from "./ApiHelper.js";
import { Logger } from "./Logger.js";

interface TermStoreTerm {
  id: string;
  labels?: { name: string; isDefault?: boolean; languageTag?: string }[];
  isDeprecated?: boolean;
  /** How many terms sit directly under this one, when the store says */
  childrenCount?: number;
}

/** A term with the labels it can be addressed by, flattened out of the tree */
export interface ResolvedTerm {
  id: string;
  /** The default label, which is what a picker shows and an author writes */
  label: string;
  /** Every label of the term, used for matching */
  labels: string[];
  /** Ancestors' default labels, outermost first — used to disambiguate */
  path: string[];
}

const trimUrl = (webUrl: string): string => webUrl.replace(/\/+$/, "");

const defaultLabel = (term: TermStoreTerm): string => {
  const labels = term.labels || [];
  const preferred = labels.find((entry) => entry.isDefault) || labels[0];
  return preferred?.name || "";
};

export class TermsHelper {
  /** The flattened terms per term set (and anchor), which do not change during a run */
  private static terms: { [cacheKey: string]: ResolvedTerm[] } = {};
  /**
   * Whether the store accepts `childrenCount` in a `$select`. It tells which
   * terms have children, so the leaves — most of a term set — are not each
   * asked for children they do not have. A store which refuses the property
   * is walked the slow way rather than not at all.
   */
  private static countsChildren = true;

  public static reset(): void {
    TermsHelper.terms = {};
    TermsHelper.countsChildren = true;
  }

  /**
   * Resolve a term label to its id.
   *
   * Reads the term store the same way the metadata editor does
   * (`_api/v2.1/termStore`), so a term picked there resolves to the same term
   * here. An `anchorId` on the column restricts it to that sub-tree, which is
   * also what the picker offers, so a label is looked up in exactly the set of
   * terms the author could have chosen from.
   *
   * @param webUrl the site the column lives on
   * @param termSetId the column's term set
   * @param label the label as written in the front matter
   * @param anchorId the column's anchor term, when it has one
   */
  public static async resolve(
    webUrl: string,
    termSetId: string,
    label: string,
    anchorId?: string,
  ): Promise<ResolvedTerm> {
    const terms = await TermsHelper.getTerms(webUrl, termSetId, anchorId);
    const matches = TermsHelper.match(terms, label);

    if (matches.length === 0) {
      throw new Error(
        `The term "${label}" does not exist in term set ${termSetId}${
          anchorId ? ` under the anchor term ${anchorId}` : ""
        }.`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `The term "${label}" is ambiguous in term set ${termSetId} — it matches ${matches.length} terms: ${matches
          .map((term) => [...term.path, term.label].join(" > "))
          .join(", ")}. Use { label, termGuid } in the front matter to say which one is meant.`,
      );
    }

    return matches[0];
  }

  /**
   * Terms whose label matches, or whose full path does. A path lets an author
   * write `Regions > Europe` to pick one of two terms that share a label.
   *
   * Public because it is the whole of the matching behaviour and the only part
   * of this helper that can be verified without a tenant.
   */
  public static match(terms: ResolvedTerm[], label: string): ResolvedTerm[] {
    const wanted = label.trim().toLowerCase();

    const byPath = terms.filter(
      (term) =>
        [...term.path, term.label].join(" > ").toLowerCase() === wanted ||
        [...term.path, term.label].join(">").toLowerCase() ===
          wanted.replace(/\s*>\s*/g, ">"),
    );
    if (byPath.length > 0) {
      return byPath;
    }

    return terms.filter((term) =>
      term.labels.some((entry) => entry.trim().toLowerCase() === wanted),
    );
  }

  /**
   * Every term of the set (or of the anchor's sub-tree), flattened. Walked once
   * per set per run — a term set is far too large to re-read per page.
   */
  private static async getTerms(
    webUrl: string,
    termSetId: string,
    anchorId?: string,
  ): Promise<ResolvedTerm[]> {
    const cacheKey = `${trimUrl(webUrl).toLowerCase()}:${termSetId}:${anchorId || ""}`;

    if (!TermsHelper.terms[cacheKey]) {
      Logger.debug(
        `Reading the terms of set ${termSetId}${anchorId ? ` under ${anchorId}` : ""}.`,
      );
      TermsHelper.terms[cacheKey] = await TermsHelper.walk(
        webUrl,
        termSetId,
        anchorId,
        [],
      );
    }

    return TermsHelper.terms[cacheKey];
  }

  private static async walk(
    webUrl: string,
    termSetId: string,
    parentId: string | undefined,
    path: string[],
  ): Promise<ResolvedTerm[]> {
    const children = await TermsHelper.readChildren(
      webUrl,
      termSetId,
      parentId,
    );

    const resolved: ResolvedTerm[] = [];

    for (const child of children) {
      const label = defaultLabel(child);

      // A deprecated term cannot be set on an item, and is not offered by the
      // picker either, so matching one would only produce a confusing failure.
      // Its children are another matter: deprecating a term leaves the terms
      // under it as they were, so they are still read.
      if (!child.isDeprecated) {
        resolved.push({
          id: child.id,
          label,
          labels: (child.labels || [])
            .map((entry) => entry.name)
            .filter(Boolean),
          path,
        });
      }

      // A count of 0 is a leaf. No count at all says nothing, so it is asked.
      if (child.childrenCount !== 0) {
        resolved.push(
          ...(await TermsHelper.walk(webUrl, termSetId, child.id, [
            ...path,
            label,
          ])),
        );
      }
    }

    return resolved;
  }

  /** The terms directly under a set or a term, every page of them */
  private static async readChildren(
    webUrl: string,
    termSetId: string,
    parentId: string | undefined,
  ): Promise<TermStoreTerm[]> {
    const base = trimUrl(webUrl);
    const set = encodeURIComponent(termSetId);
    const collection = parentId
      ? `${base}/_api/v2.1/termStore/sets/${set}/terms/${encodeURIComponent(parentId)}/children`
      : `${base}/_api/v2.1/termStore/sets/${set}/children`;
    const select = (withCount: boolean) =>
      `${collection}?$select=id,labels,isDeprecated${withCount ? ",childrenCount" : ""}`;

    const read = async (first: string): Promise<TermStoreTerm[]> => {
      // The term store answers in pages. Reading only the first one used to
      // make every term past it invisible, so a perfectly valid label in a
      // large set was reported as not existing in it — and the page skipped
      // over a term that was there all along.
      const children: TermStoreTerm[] = [];
      let url: string | null = first;

      while (url) {
        const response: any = await ApiHelper.getOrThrow(url, {
          Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
          accept: "application/json",
        });

        children.push(...((response?.value as TermStoreTerm[]) || []));

        const next =
          response?.["@odata.nextLink"] || response?.["odata.nextLink"];
        url = typeof next === "string" && next !== url ? next : null;
      }

      return children;
    };

    if (!TermsHelper.countsChildren) {
      return await read(select(false));
    }

    try {
      return await read(select(true));
    } catch (e: any) {
      // Only a refusal of the query is worth another try without the count;
      // anything else fails the same way again
      if (!/status 400|childrenCount/i.test(`${e?.message || e}`)) {
        throw e;
      }

      Logger.debug(
        `The term store refused childrenCount, reading every term's children instead: ${e?.message || e}`,
      );
      TermsHelper.countsChildren = false;
      return await read(select(false));
    }
  }
}
