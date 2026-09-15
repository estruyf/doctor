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
const PAGE_SETTINGS_CONTROL_TYPE = 0;
const WEB_PART_CONTROL_TYPE = 3;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const escapeForRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const trimUrl = (webUrl: string): string => webUrl.replace(/\/+$/, "");

const pageApiUrl = (webUrl: string, slug: string): string =>
  `${trimUrl(webUrl)}/_api/sitepages/pages/GetByUrl('sitepages/${encodeURIComponent(
    slug,
  )}')`;

/**
 * Every page needs a token for its read and its write, and fetching one runs
 * two CLI commands. Holding on to it for a while keeps a publish of hundreds of
 * pages from paying that twice per page, while the window stays far short of
 * the token's own lifetime so a long run cannot end up using an expired one.
 */
const TOKEN_LIFETIME = 10 * 60 * 1000;

export class CanvasHelper {
  /** The available web parts per site, which never change during a run */
  private static definitions: { [webUrl: string]: any[] } = {};
  private static tokens: { [webUrl: string]: { token: string; at: number } } =
    {};

  public static reset(): void {
    CanvasHelper.definitions = {};
    CanvasHelper.tokens = {};
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

    const column = options.column ?? 1;
    const zoneIndex = CanvasHelper.getZoneIndex(canvas, options.section);
    const inColumn = (control: CanvasControl) =>
      !!control.position &&
      control.position.zoneIndex === zoneIndex &&
      control.position.sectionIndex === column;

    const target = canvas.find(inColumn);
    if (!target) {
      throw new Error(
        `Column ${column} does not exist in section ${options.section ?? 1} of the page.`,
      );
    }

    const isOwned = CanvasHelper.ownershipTest(options, inColumn);

    // An empty column is a placeholder rather than a control, so the web parts
    // take its place instead of being added next to it
    const placeholder =
      controls.length > 0 && !target.controlType && !isOwned(target)
        ? target
        : null;

    const kept = canvas.filter(
      (control) => control !== placeholder && !isOwned(control),
    );

    const built = controls.map((control) =>
      CanvasHelper.buildControl(control, target, zoneIndex, column),
    );

    kept.splice(
      CanvasHelper.getAnchor(canvas, kept, isOwned, placeholder, inColumn),
      0,
      ...built,
    );

    return CanvasHelper.normalize(kept, inColumn);
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

    const column = options.column ?? 1;
    let zoneIndex: number;
    try {
      zoneIndex = CanvasHelper.getZoneIndex(existing, options.section);
    } catch {
      // No section to own anything in yet
      return [];
    }

    const inColumn = (control: CanvasControl) =>
      !!control.position &&
      control.position.zoneIndex === zoneIndex &&
      control.position.sectionIndex === column;

    return existing.filter(CanvasHelper.ownershipTest(options, inColumn));
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
   * ids are authoritative; the title is only trusted inside doctor's own column,
   * because it is a much weaker signal.
   */
  private static ownershipTest(
    options: ComposeOptions,
    inColumn: (control: CanvasControl) => boolean,
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

      const title = control.webPartData.title;
      if (!prefix || typeof title !== "string" || !inColumn(control)) {
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
    isOwned: (control: CanvasControl) => boolean,
    placeholder: CanvasControl | null,
    inColumn: (control: CanvasControl) => boolean,
  ): number {
    // The anchor is an index into `kept`, so only what survived counts
    if (placeholder) {
      let position = 0;
      for (const control of canvas) {
        if (control === placeholder) {
          return position;
        }
        if (!isOwned(control)) {
          position++;
        }
      }
      return position;
    }

    let position = 0;
    for (const control of canvas) {
      if (isOwned(control)) {
        return position;
      }
      position++;
    }

    // Nothing of doctor's on the page yet: append after the column's content
    let last = -1;
    kept.forEach((control, index) => {
      if (inColumn(control)) {
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
    target: CanvasControl,
    zoneIndex: number,
    column: number,
  ): CanvasControl {
    const instanceId = control.instanceId || randomUUID();

    const built: CanvasControl = {
      controlType: WEB_PART_CONTROL_TYPE,
      displayMode: 2,
      id: instanceId,
      position: {
        zoneIndex,
        sectionIndex: column,
        sectionFactor: target.position.sectionFactor,
        layoutIndex: target.position.layoutIndex,
        controlIndex: 1,
      },
      webPartId: control.webPartId,
      emphasis: {},
      webPartData: {
        ...control.webPartData,
        id: control.webPartId,
        instanceId,
      },
    };

    if (target.zoneGroupMetadata) {
      built.zoneGroupMetadata = target.zoneGroupMetadata;
    }

    return built;
  }

  /**
   * Renumber the column so the controls sit in array order without gaps, and
   * keep the page settings slice last where SharePoint expects it.
   */
  private static normalize(
    canvas: CanvasControl[],
    inColumn: (control: CanvasControl) => boolean,
  ): CanvasControl[] {
    let index = 1;
    for (const control of canvas) {
      if (inColumn(control)) {
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

  /**
   * Read the page and check it out, which is what SharePoint expects before its
   * canvas is rewritten.
   */
  public static async checkout(webUrl: string, slug: string): Promise<any> {
    const headers = await CanvasHelper.getHeaders(webUrl);
    const url = pageApiUrl(webUrl, slug);

    const page = await ApiHelper.getOrThrow(url, headers);
    if (page && page.IsPageCheckedOutToCurrentUser) {
      return page;
    }

    Logger.debug(`Checking out the page ${slug} before rewriting its canvas.`);
    return await ApiHelper.postOrThrow(`${url}/checkoutpage`, headers);
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
    const preconfigured = manifest.preconfiguredEntries[0];

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
    const key = trimUrl(webUrl).toLowerCase();
    const cached = CanvasHelper.tokens[key];

    if (!cached || Date.now() - cached.at > TOKEN_LIFETIME) {
      CanvasHelper.tokens[key] = {
        token: (await AccessToken.get(webUrl)).trim(),
        at: Date.now(),
      };
    }

    return {
      Authorization: `Bearer ${CanvasHelper.tokens[key].token}`,
      accept: "application/json;odata=nometadata",
    };
  }
}
