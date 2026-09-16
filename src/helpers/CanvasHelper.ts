import { randomUUID } from "crypto";
import { AccessToken } from "./AccessToken.js";
import { ApiHelper } from "./ApiHelper.js";
import { Logger } from "./Logger.js";

/**
 * The canvas is SharePoint's own `CanvasContent1` structure. It is kept as
 * loose JSON on purpose: doctor only positions the controls it owns and has to
 * hand everything else back untouched, including keys it does not know about.
 */
export type CanvasControl = any;

export interface ControlPlacement {
  /** 1-based section, counted over the distinct zones like the CLI does */
  section?: number;
  /** 1-based column within that section */
  column?: number;
}

export interface ComposeOptions extends ControlPlacement {
  /**
   * The instance ids doctor recorded for this page on an earlier run. Matching
   * on these is what keeps a control the page owner added by hand from being
   * treated as doctor's and replaced.
   */
  ownedInstanceIds?: string[];
  /**
   * The `--webPartTitle` doctor gives its markdown controls. Used to recognise
   * them when there is no recorded state to go on, matching both the title
   * itself and the numbered ones a multi-segment page gets.
   */
  ownedTitlePrefix?: string;
}

export interface CanvasPosition {
  zoneIndex: number;
  sectionIndex: number;
  sectionFactor: number;
  layoutIndex: number;
  controlIndex?: number;
}

export interface WebPartControl {
  webPartId: string;
  webPartData: any;
  /** Reuse the instance id of the control this replaces, when there is one */
  instanceId?: string;
}

const DEFAULT_CANVAS: CanvasControl[] = [
  {
    controlType: 0,
    pageSettingsSlice: { isDefaultDescription: true, isDefaultThumbnail: true },
  },
];

const DEFAULT_SECTION: CanvasControl = {
  position: {
    controlIndex: 1,
    sectionIndex: 1,
    zoneIndex: 1,
    sectionFactor: 12,
    layoutIndex: 1,
  },
  emphasis: {},
  displayMode: 2,
};

/** SharePoint's vertical section, which is never the target for page content */
const VERTICAL_SECTION_LAYOUT = 2;
/** SharePoint marks a full-width section, which holds one banner web part, this way */
const FULL_WIDTH_SECTION_FACTOR = 0;
const PAGE_SETTINGS_CONTROL_TYPE = 0;
/** The banner, which carries the page title inside its own properties */
const PAGE_TITLE_WEB_PART_ID = "cbe7b0a9-3504-44dd-a3a3-0e5cacd07788";
const WEB_PART_CONTROL_TYPE = 3;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const escapeForRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const trimUrl = (webUrl: string): string => webUrl.replace(/\/+$/, "");

const pageApiUrl = (webUrl: string, slug: string): string =>
  `${trimUrl(webUrl)}/_api/sitepages/pages/GetByUrl('sitepages/${encodeURIComponent(
    slug,
  )}')`;

export class CanvasHelper {
  /** The available web parts per site, which never change during a run */
  private static definitions: { [webUrl: string]: any[] } = {};

  public static reset(): void {
    CanvasHelper.definitions = {};
  }

  /**
   * Place doctor's controls on the page canvas, leaving every other control
   * alone. Pure: it is the part of the publish path that can be verified
   * without a tenant, which is why the I/O lives in separate methods.
   *
   * @param existing the page's current `CanvasContent1`, parsed
   * @param controls the web parts doctor wants on the page, in source order
   * @param options where to place them and how to recognise doctor's own
   */
  public static compose(
    existing: CanvasControl[] | null,
    controls: WebPartControl[],
    options: ComposeOptions = {},
  ): CanvasControl[] {
    const canvas: CanvasControl[] =
      existing && existing.length > 0 ? clone(existing) : clone(DEFAULT_CANVAS);

    // A page that never had content has no section to put a web part in
    if (!canvas.some((control) => control.position)) {
      canvas.unshift(clone(DEFAULT_SECTION));
    }

    const isOwned = CanvasHelper.ownershipTest(options);
    const target = CanvasHelper.getTargetPosition(canvas, options, isOwned);

    const inTarget = (control: CanvasControl) =>
      !!control.position &&
      control.position.zoneIndex === target.zoneIndex &&
      control.position.sectionIndex === target.sectionIndex;

    // The markdown file is the page. Doctor's content section is rewritten to
    // exactly what the file says, so a web part somebody added there by hand,
    // an empty column placeholder, or a control doctor itself left behind in
    // an earlier layout all go. Every other section — the full-width banner,
    // a vertical section, anything a template brought along — is left alone.
    const replaced = (control: CanvasControl): boolean =>
      isOwned(control) ||
      (controls.length > 0 &&
        inTarget(control) &&
        control.controlType !== PAGE_SETTINGS_CONTROL_TYPE);

    const kept = canvas.filter((control) => !replaced(control));

    const built = controls.map((control) =>
      CanvasHelper.buildControl(control, target),
    );

    kept.splice(
      CanvasHelper.getAnchor(canvas, kept, replaced, inTarget),
      0,
      ...built,
    );

    return CanvasHelper.normalize(kept, inTarget);
  }

  /**
   * The canvas a page should start from when its template is re-applied.
   *
   * The template supplies the layout — its sections, and whatever furniture it
   * carries. The page keeps its own banner, because a banner stores the page
   * title inside the web part, so taking the template's would stamp the
   * template's title onto every page that uses it.
   *
   * The template's own doctor controls are left in place on purpose: they mark
   * where the content goes, and `compose()` recognises and replaces them.
   *
   * @param template the template page's canvas
   * @param page the canvas of the page being published
   */
  public static mergeTemplate(
    template: CanvasControl[] | null,
    page: CanvasControl[] | null,
    options: ComposeOptions = {},
  ): CanvasControl[] {
    if (!template || template.length === 0) {
      return page ? clone(page) : [];
    }

    const merged = clone(template);

    // A template which says nothing about where the content goes gets a
    // section of its own for it. Without this, doctor would take over the
    // template's first ordinary section and clear whatever the template put
    // there — the sections are the reason to use a template at all.
    const isOwned = CanvasHelper.ownershipTest(options);
    if (!merged.some((control) => isOwned(control))) {
      const zones = merged
        .filter((control) => control.position)
        .map((control) => control.position.zoneIndex);

      merged.push({
        position: {
          zoneIndex: zones.length > 0 ? Math.max(...zones) + 1 : 1,
          sectionIndex: 1,
          sectionFactor: 12,
          layoutIndex: 1,
          controlIndex: 1,
        },
        emphasis: {},
        displayMode: 2,
      });
    }
    const isBanner = (control: CanvasControl) =>
      typeof control?.webPartId === "string" &&
      control.webPartId.toLowerCase() === PAGE_TITLE_WEB_PART_ID;

    const ownBanner = (page || []).find(isBanner);
    if (!ownBanner) {
      return merged;
    }

    const templateBanner = merged.findIndex(isBanner);
    if (templateBanner >= 0) {
      // Same slot in the template's layout, the page's own banner in it
      merged[templateBanner] = {
        ...clone(ownBanner),
        position: merged[templateBanner].position,
      };
    } else {
      // The template reserves no slot for a banner, so the page's own one gets
      // a full-width section above everything the template brought.
      //
      // It cannot keep the position it had on the page: that numbering belongs
      // to the page's layout, not this one, and a banner landing in the same
      // zone as one of the template's ordinary sections leaves that zone both
      // full width and twelve columns wide at once. The template's zones move
      // up to make room instead, so every zone keeps a single width.
      for (const control of merged) {
        if (control.position) {
          control.position.zoneIndex = (control.position.zoneIndex ?? 1) + 1;
        }
      }

      merged.unshift({
        ...clone(ownBanner),
        position: {
          ...(ownBanner.position ?? {}),
          zoneIndex: 1,
          sectionIndex: 1,
          sectionFactor: FULL_WIDTH_SECTION_FACTOR,
          layoutIndex: 1,
          controlIndex: 1,
        },
      });
    }

    return merged;
  }

  /**
   * Where doctor's controls belong.
   *
   * In order: the section its own controls are already in, so re-publishing
   * never moves a page's content; otherwise the first ordinary content section;
   * otherwise a new one-column section after everything else.
   *
   * The full-width and vertical sections are deliberately never chosen. A
   * full-width section holds a single banner web part — dropping the markdown
   * in beside it is not a layout SharePoint offers.
   */
  private static getTargetPosition(
    canvas: CanvasControl[],
    options: ComposeOptions,
    isOwned: (control: CanvasControl) => boolean,
  ): CanvasPosition {
    // An explicit section/column wins, for a caller that knows where it wants to be
    if (options.section || options.column) {
      const zoneIndex = CanvasHelper.getZoneIndex(canvas, options.section);
      const sectionIndex = options.column ?? 1;
      const control = canvas.find(
        (entry) =>
          entry.position &&
          entry.position.zoneIndex === zoneIndex &&
          entry.position.sectionIndex === sectionIndex,
      );

      if (!control) {
        throw new Error(
          `Column ${sectionIndex} does not exist in section ${options.section ?? 1} of the page.`,
        );
      }

      return { ...control.position };
    }

    // Where doctor's content already is — but only when that is somewhere it
    // should have been. A control left in the full-width banner section by an
    // earlier run is not a position to preserve, it is one to correct.
    const owned = canvas.find(
      (control) => isOwned(control) && CanvasHelper.isContentSection(control),
    );
    if (owned) {
      return { ...owned.position };
    }

    // An empty column is a slot waiting for content, so it is a better home
    // than a section which already holds somebody else's web parts — taking
    // that one would clear it
    const empty = canvas.find(
      (control) =>
        !control.controlType && CanvasHelper.isOneColumnSection(control),
    );
    if (empty) {
      return { ...empty.position };
    }

    const content =
      canvas.find((control) => CanvasHelper.isOneColumnSection(control)) ||
      canvas.find((control) => CanvasHelper.isContentSection(control));
    if (content) {
      return { ...content.position };
    }

    // Only a banner (or nothing usable) on the page: give the content a section
    // of its own underneath. A new zone, not another column of the banner's
    // section — a full-width section takes a single web part.
    const zones = canvas
      .filter((control) => control.position)
      .map((control) => control.position.zoneIndex);

    return {
      zoneIndex: zones.length > 0 ? Math.max(...zones) + 1 : 1,
      sectionIndex: 1,
      sectionFactor: 12,
      layoutIndex: 1,
      controlIndex: 1,
    };
  }

  /** A section that holds page content, so neither full width nor vertical */
  private static isContentSection(control: CanvasControl): boolean {
    return (
      !!control.position &&
      control.position.layoutIndex !== VERTICAL_SECTION_LAYOUT &&
      control.position.sectionFactor !== FULL_WIDTH_SECTION_FACTOR
    );
  }

  /** A content section spanning the full grid, which is the usual place for a page's body */
  private static isOneColumnSection(control: CanvasControl): boolean {
    return (
      CanvasHelper.isContentSection(control) &&
      control.position.sectionFactor === 12
    );
  }

  /**
   * The controls on the page that doctor put there, in canvas order. The
   * caller reuses their instance ids so SharePoint keeps a control's identity
   * across runs instead of seeing a delete and an add.
   */
  public static getOwned(
    existing: CanvasControl[] | null,
    options: ComposeOptions = {},
  ): CanvasControl[] {
    if (!existing || existing.length === 0) {
      return [];
    }

    return existing.filter(CanvasHelper.ownershipTest(options));
  }

  /**
   * SharePoint counts sections by their distinct zone, and the vertical section
   * is not one of them.
   */
  private static getZoneIndex(
    canvas: CanvasControl[],
    section: number = 1,
  ): number {
    const zoneIndices = canvas
      .filter(
        (control) =>
          control.position &&
          control.position.layoutIndex !== VERTICAL_SECTION_LAYOUT,
      )
      .map((control) => control.position.zoneIndex)
      .filter((zone, index, all) => all.indexOf(zone) === index)
      .sort((a, b) => a - b);

    if (section > zoneIndices.length) {
      throw new Error(
        `Section ${section} does not exist on the page, which has ${zoneIndices.length} section(s).`,
      );
    }

    return zoneIndices[section - 1];
  }

  /**
   * Recognise the controls doctor put on the page itself. The recorded instance
   * ids are authoritative; the title is the fallback when there is no state to
   * go on.
   */
  private static ownershipTest(
    options: ComposeOptions,
  ): (control: CanvasControl) => boolean {
    const instanceIds = new Set(options.ownedInstanceIds ?? []);
    const prefix = options.ownedTitlePrefix;
    // A page split into segments numbers the controls after the first
    const numbered = prefix
      ? new RegExp(`^${escapeForRegex(prefix)} \\(\\d+\\)$`)
      : null;

    return (control: CanvasControl): boolean => {
      if (!control || !control.webPartData) {
        return false;
      }

      if (control.id && instanceIds.has(control.id)) {
        return true;
      }

      // Deliberately not restricted to the target section: doctor has to
      // recognise its own control wherever the page happens to hold it,
      // otherwise it leaves that one behind and adds a second one elsewhere.
      const title = control.webPartData.title;
      if (!prefix || typeof title !== "string") {
        return false;
      }

      return title === prefix || !!numbered?.test(title);
    };
  }

  /**
   * Doctor's controls go back where its previous ones were, so the controls the
   * page owner added around them keep their place.
   */
  private static getAnchor(
    canvas: CanvasControl[],
    kept: CanvasControl[],
    replaced: (control: CanvasControl) => boolean,
    inTarget: (control: CanvasControl) => boolean,
  ): number {
    // The anchor is an index into `kept`, so only what survived counts: the new
    // controls go where the section's old content started
    let position = 0;
    for (const control of canvas) {
      if (replaced(control)) {
        return position;
      }
      position++;
    }

    // Nothing was replaced, so the section is new or empty
    let last = -1;
    kept.forEach((control, index) => {
      if (inTarget(control)) {
        last = index;
      }
    });

    if (last >= 0) {
      return last + 1;
    }

    const settings = kept.findIndex(
      (control) => control.controlType === PAGE_SETTINGS_CONTROL_TYPE,
    );
    return settings >= 0 ? settings : kept.length;
  }

  private static buildControl(
    control: WebPartControl,
    target: CanvasPosition,
  ): CanvasControl {
    const instanceId = control.instanceId || randomUUID();

    return {
      controlType: WEB_PART_CONTROL_TYPE,
      displayMode: 2,
      id: instanceId,
      position: { ...target, controlIndex: 1 },
      webPartId: control.webPartId,
      emphasis: {},
      webPartData: {
        ...control.webPartData,
        id: control.webPartId,
        instanceId,
      },
    };
  }

  /**
   * Renumber the section so the controls sit in array order without gaps, and
   * keep the page settings slice last where SharePoint expects it.
   */
  private static normalize(
    canvas: CanvasControl[],
    inTarget: (control: CanvasControl) => boolean,
  ): CanvasControl[] {
    let index = 1;
    for (const control of canvas) {
      if (inTarget(control)) {
        control.position.controlIndex = index++;
      }
    }

    const settings = canvas.filter(
      (control) => control.controlType === PAGE_SETTINGS_CONTROL_TYPE,
    );
    if (settings.length === 0) {
      return canvas;
    }

    return [
      ...canvas.filter(
        (control) => control.controlType !== PAGE_SETTINGS_CONTROL_TYPE,
      ),
      ...settings,
    ];
  }


  public static async checkout(webUrl: string, slug: string): Promise<any> {
    const headers = await CanvasHelper.getHeaders(webUrl);
    const url = pageApiUrl(webUrl, slug);

    // Always taken, never assumed. Reading the page instead when it is already
    // checked out hands back the published version, and composing on that makes
    // SharePoint reject the save as a conflict with "changes made concurrently"
    // — which is what a checkout left behind by an interrupted run looks like.
    Logger.debug(`Checking out the page ${slug} before rewriting its canvas.`);
    return await ApiHelper.postOrThrow(`${url}/checkoutpage`, headers);
  }

  /**
   * SharePoint refuses a save when the page moved on since it was read. It is
   * worth one more attempt from the page as it now stands, rather than failing
   * a page over a draft an earlier run left behind.
   */
  public static isSaveConflict(error: unknown): boolean {
    const message =
      typeof error === "string"
        ? error
        : (error as any)?.message || JSON.stringify(error);

    return (
      !!message &&
      (message.includes("status 409") ||
        message.toLowerCase().includes("save conflict"))
    );
  }

  /**
   * Read a page without checking it out, for pages doctor does not write to —
   * a page template, for instance.
   */
  public static async read(webUrl: string, slug: string): Promise<any> {
    return await ApiHelper.getOrThrow(
      pageApiUrl(webUrl, slug),
      await CanvasHelper.getHeaders(webUrl),
    );
  }

  /**
   * Write the canvas back as a draft. Publishing stays where it already is, in
   * `PagesHelper.publishPageIfNeeded`, so a `draft: true` page is left alone.
   */
  public static async save(
    webUrl: string,
    slug: string,
    canvas: CanvasControl[],
  ): Promise<void> {
    const headers = await CanvasHelper.getHeaders(webUrl);

    await ApiHelper.postOrThrow(
      `${pageApiUrl(webUrl, slug)}/SavePageAsDraft`,
      {
        ...headers,
        "X-HTTP-Method": "MERGE",
        "IF-MATCH": "*",
        "content-type": "application/json;odata=nometadata",
      },
      { CanvasContent1: JSON.stringify(canvas) },
    );
  }

  /**
   * The web part definition SharePoint holds for an id, which carries the
   * default title, description and properties a new instance starts from.
   */
  public static async getDefinition(
    webUrl: string,
    webPartId: string,
  ): Promise<any> {
    const key = trimUrl(webUrl).toLowerCase();

    if (!CanvasHelper.definitions[key]) {
      const response = await ApiHelper.getOrThrow(
        `${trimUrl(webUrl)}/_api/web/getclientsidewebparts()`,
        await CanvasHelper.getHeaders(webUrl),
      );
      CanvasHelper.definitions[key] = response?.value || [];
    }

    const wanted = webPartId.toLowerCase();
    const definition = CanvasHelper.definitions[key].find(
      (component: any) =>
        component.Id &&
        component.Id.replace(/^\{|\}$/g, "").toLowerCase() === wanted,
    );

    if (!definition) {
      throw new Error(
        `The site has no web part with id ${webPartId}. Check that the web part is deployed and enabled on ${webUrl}.`,
      );
    }

    return definition;
  }

  /**
   * Turn a web part definition into the `webPartData` a new instance needs
   */
  public static async getWebPartData(
    webUrl: string,
    webPartId: string,
    properties: any = null,
  ): Promise<any> {
    const definition = await CanvasHelper.getDefinition(webUrl, webPartId);
    const manifest = JSON.parse(definition.Manifest);
    const preconfigured = manifest?.preconfiguredEntries?.[0];

    if (!preconfigured) {
      throw new Error(
        `The web part ${webPartId} on ${webUrl} declares no preconfigured entry, so doctor has no defaults to build an instance from. A control shortcode can supply them itself with 'webPartData'.`,
      );
    }

    return {
      dataVersion: "1.0",
      description: preconfigured.description?.default ?? "",
      title: preconfigured.title?.default ?? "",
      properties: properties
        ? { ...preconfigured.properties, ...properties }
        : preconfigured.properties,
    };
  }

  private static async getHeaders(webUrl: string): Promise<any> {
    return {
      Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
      accept: "application/json;odata=nometadata",
    };
  }
}
