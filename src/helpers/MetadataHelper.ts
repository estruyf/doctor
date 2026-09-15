import { Logger } from "./Logger.js";

/** A taxonomy value as written in the front matter, once normalised */
export interface TaxonomyTerm {
  label: string;
  termGuid?: string;
}

/**
 * Turns front matter values into the shapes SharePoint's
 * `ValidateUpdateListItem` accepts for each column type.
 *
 * Pure on purpose: everything here is value in, value out, so the formats can
 * be verified without a tenant. Anything that has to ask SharePoint a question
 * — resolving a term label, or a site user id — lives in `PagesHelper` and
 * calls into this once it has the answer.
 */
export class MetadataHelper {
  /** The claim prefix SharePoint uses for a member of the tenant */
  public static readonly PERSON_CLAIM_PREFIX = "i:0#.f|membership|";

  /** Column types whose value is passed through untouched */
  public static readonly SIMPLE_FIELD_TYPES = new Set<string>([
    "Text",
    "Note",
    "Number",
    "Currency",
    "Boolean",
    "Choice",
  ]);

  /**
   * Read a taxonomy value, which is either a plain label or an object naming
   * the term outright
   * @param value
   */
  public static normalizeTaxonomyTerm(value: any): TaxonomyTerm | null {
    if (typeof value === "string") {
      const label = value.trim();
      return label ? { label } : null;
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const label = typeof value.label === "string" ? value.label.trim() : "";
    const termGuid =
      typeof value.termGuid === "string" ? value.termGuid.trim() : undefined;

    if (!label) {
      return null;
    }

    return { label, ...(termGuid ? { termGuid } : {}) };
  }

  /**
   * The `Label|Guid` pair SharePoint stores a term as. The label has to be the
   * term's own, which is not always what the author wrote — a term can be
   * addressed by a synonym or by its path.
   * @param label
   * @param termGuid
   */
  public static toTaxonomyValue(label: string, termGuid: string): string {
    return `${label}|${termGuid}`;
  }

  /**
   * Several terms on one column, in the order they were written
   * @param values
   */
  public static joinTaxonomyValues(values: string[]): string | undefined {
    return values.length > 0 ? values.join(";") : undefined;
  }

  /**
   * A person column takes a claim rather than a user name
   * @param value a UPN
   */
  public static toUserClaim(value: any): string | undefined {
    const claim = MetadataHelper.toClaimKey(value);

    if (!claim) {
      Logger.debug(`Skipping User field because value '${value}' is invalid.`);
      return undefined;
    }

    return `[{'Key':'${claim}'}]`;
  }

  /**
   * Several people on one column
   * @param value a UPN or an array of them
   */
  public static toUserClaims(value: any): string | undefined {
    const values = Array.isArray(value) ? value : [value];
    const claims: string[] = [];

    for (const entry of values) {
      const claim = MetadataHelper.toClaimKey(entry);
      if (!claim) {
        Logger.debug(`Skipping invalid UserMulti value '${entry}'.`);
        continue;
      }

      claims.push(`{'Key':'${claim}'}`);
    }

    return claims.length > 0 ? `[${claims.join(",")}]` : undefined;
  }

  /**
   * The claim for a UPN. SharePoint stores the login name lower cased, and
   * compares it that way.
   * @param value
   */
  public static toClaimKey(value: any): string | undefined {
    if (typeof value !== "string" || !value.trim()) {
      return undefined;
    }

    return `${MetadataHelper.PERSON_CLAIM_PREFIX}${value.trim().toLowerCase()}`;
  }

  /**
   * SharePoint wants `YYYY-MM-DD HH:MM:SS`. A date with no time is midnight,
   * and anything else is parsed and reformatted in local time.
   * @param value
   */
  public static transformDateTime(value: any): any {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed} 00:00:00`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${MetadataHelper.pad2(
        parsed.getMonth() + 1,
      )}-${MetadataHelper.pad2(parsed.getDate())} ${MetadataHelper.pad2(
        parsed.getHours(),
      )}:${MetadataHelper.pad2(parsed.getMinutes())}:${MetadataHelper.pad2(
        parsed.getSeconds(),
      )}`;
    }

    Logger.debug(
      `DateTime value '${value}' is ambiguous or invalid. Passing through without conversion.`,
    );
    return value;
  }

  /**
   * A lookup column points at another list item by its id
   * @param value
   * @param fieldName only used to say which column was skipped
   */
  public static transformLookupSingle(
    value: any,
    fieldName: string = "",
  ): number | undefined {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return parseInt(value.trim(), 10);
    }

    Logger.debug(
      `Skipping lookup field '${fieldName}' because value '${value}' is not a numeric item ID.`,
    );
    return undefined;
  }

  /**
   * Several lookups on one column
   * @param value
   * @param fieldName
   */
  public static transformLookupMulti(
    value: any,
    fieldName: string = "",
  ): string | undefined {
    const values = Array.isArray(value) ? value : [value];
    const ids: number[] = [];

    for (const entry of values) {
      const transformed = MetadataHelper.transformLookupSingle(
        entry,
        fieldName,
      );
      if (typeof transformed === "number") {
        ids.push(transformed);
      }
    }

    return ids.length > 0 ? ids.join(";#") : undefined;
  }

  /**
   * A hyperlink column takes `url, description`
   * @param value a string, or an object with `url` and optional `description`
   */
  public static transformUrl(value: any): string | undefined {
    if (typeof value === "string") {
      return value;
    }

    if (!value || typeof value !== "object") {
      Logger.debug(`Skipping URL field because value '${value}' is invalid.`);
      return undefined;
    }

    const url = typeof value.url === "string" ? value.url.trim() : "";
    const description =
      typeof value.description === "string" ? value.description.trim() : "";

    if (!url) {
      Logger.debug(`Skipping URL field because the url property is missing.`);
      return undefined;
    }

    return description ? `${url}, ${description}` : url;
  }

  /**
   * Several choices on one column
   * @param value
   */
  public static transformMultiChoice(value: any): any {
    if (Array.isArray(value)) {
      return value
        .filter((entry) => typeof entry === "string" && entry.trim())
        .join(";#");
    }

    return value;
  }

  private static pad2(value: number): string {
    return value.toString().padStart(2, "0");
  }
}
