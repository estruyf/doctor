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
   * The value a person column takes: the claims of the people on it.
   *
   * The claims come from `PagesHelper`, which asks the site to resolve each
   * name first — a guest or a group does not use the shape a principal name is
   * assembled into, so the login name the site holds is the only one it will
   * compare against.
   *
   * Serialised as JSON rather than assembled by hand: a login name can hold a
   * `'` — `o'neill@contoso.com` is a valid principal name — and spliced into a
   * single-quoted string it ended the value early, so SharePoint refused the
   * column after the page had already been written.
   * @param loginNames one claim per person, in the order they were written
   */
  public static toPersonValue(loginNames: string[]): string | undefined {
    if (loginNames.length === 0) {
      return undefined;
    }

    return JSON.stringify(loginNames.map((name) => ({ Key: name })));
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
   * SharePoint wants `YYYY-MM-DD HH:MM:SS`, which it reads in the site's time
   * zone.
   *
   * The result must not depend on the machine running doctor, or the same
   * markdown publishes a different date from a laptop than from a pipeline
   * running in UTC. So a time that names its zone — `Z`, `+02:00`, or a date
   * YAML already parsed — is written in UTC, and one that names none is
   * written as it stands. A date without a time is midnight.
   * @param value
   */
  public static transformDateTime(value: any): any {
    // A date written without quotes is parsed by YAML itself, so it arrives as
    // a Date — a moment in UTC. Read back in UTC, `2026-03-15` stays the 15th
    // wherever doctor runs; in local time it moved to the 14th west of
    // Greenwich.
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? undefined
        : MetadataHelper.formatUtc(value);
    }

    // Anything which is not a date and not text cannot be one
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed} 00:00:00`;
    }

    const iso =
      /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(
        trimmed,
      );
    if (iso) {
      const [, date, hours, minutes, seconds = "00", zone] = iso;

      // Taken apart by hand rather than by Date, so it also has to be checked
      // by hand: `2026-02-30` is the right shape and not a day
      const asUtc = new Date(`${date}T${hours}:${minutes}:${seconds}Z`);
      if (
        Number.isNaN(asUtc.getTime()) ||
        asUtc.toISOString().slice(0, 10) !== date
      ) {
        Logger.debug(`DateTime value '${value}' is not a real date.`);
        return undefined;
      }

      if (!zone) {
        return `${date} ${hours}:${minutes}:${seconds}`;
      }

      // `+0200` is ISO 8601 too, but not a form every Date parser takes
      const withColon = zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
      const moment = new Date(
        `${date}T${hours}:${minutes}:${seconds}${withColon.toUpperCase()}`,
      );
      if (!Number.isNaN(moment.getTime())) {
        return MetadataHelper.formatUtc(moment);
      }
    }

    // Any other way of writing a date says nothing about its zone, so it is
    // read the way it reads: in the local time it was written in
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

    // Reported rather than passed through. SharePoint rejects it either way,
    // but it does so after the page canvas has already been written — which
    // is the one outcome resolving before writing exists to prevent.
    Logger.debug(`DateTime value '${value}' cannot be read as a date.`);
    return undefined;
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
    // A list item id starts at 1, so 0 and negatives are not ids — they would
    // pass resolution and be refused by SharePoint after the canvas is written
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const id = parseInt(value.trim(), 10);
      if (id > 0) {
        return id;
      }
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

      // As with the other multi-value columns: a list that is partly readable
      // is not written as the readable part, it is reported
      if (typeof transformed !== "number") {
        return undefined;
      }

      ids.push(transformed);
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
   * Several choices on one column.
   *
   * A blank entry is not a choice, so it is left out. A number or a yes/no is
   * one YAML read before doctor did — `- 2026` is the choice "2026" — so it is
   * written as text. Anything else, a nested list or an object, cannot be a
   * choice, and as with the other multi-value columns the column is reported
   * rather than written with the entries that could be read.
   * @param value
   */
  public static transformMultiChoice(value: any): any {
    if (!Array.isArray(value)) {
      return value;
    }

    const choices: string[] = [];

    for (const entry of value) {
      if (entry === null || typeof entry === "undefined") {
        continue;
      }

      if (typeof entry === "number" || typeof entry === "boolean") {
        choices.push(String(entry));
        continue;
      }

      if (typeof entry !== "string") {
        Logger.debug(
          `Skipping choice field because ${JSON.stringify(entry)} is not a choice.`,
        );
        return undefined;
      }

      if (entry.trim()) {
        choices.push(entry.trim());
      }
    }

    return choices.join(";#");
  }

  private static formatUtc(value: Date): string {
    return `${value.getUTCFullYear()}-${MetadataHelper.pad2(
      value.getUTCMonth() + 1,
    )}-${MetadataHelper.pad2(value.getUTCDate())} ${MetadataHelper.pad2(
      value.getUTCHours(),
    )}:${MetadataHelper.pad2(value.getUTCMinutes())}:${MetadataHelper.pad2(
      value.getUTCSeconds(),
    )}`;
  }

  private static pad2(value: number): string {
    return value.toString().padStart(2, "0");
  }
}
