import {
  Capabilities,
  CommandArguments,
  PERMISSION_BITS,
  PermissionMask,
  PermissionName,
} from "@models";
import { AccessToken } from "./AccessToken.js";
import { ApiHelper } from "./ApiHelper.js";
import { Logger } from "./Logger.js";
import { OutputHelper } from "./OutputHelper.js";

const trimUrl = (webUrl: string): string => webUrl.replace(/\/+$/, "");

/** Everything allowed, which is how doctor behaved before it asked */
const ALL: Capabilities = {
  determined: false,
  publishPages: true,
  setMetadata: true,
  systemUpdate: true,
  manageNavigation: true,
  manageSiteDesign: true,
  writeAssets: true,
  readTermStore: true,
  readSiteUsers: true,
};

export class CapabilitiesHelper {
  private static capabilities: Capabilities = { ...ALL };

  public static reset(): void {
    CapabilitiesHelper.capabilities = { ...ALL };
  }

  /** What the last probe found, or everything when it has not run */
  public static get(): Capabilities {
    return CapabilitiesHelper.capabilities;
  }

  /**
   * Whether a permission is in a `{ High, Low }` mask.
   *
   * The mask is 64 bits split over two 32-bit halves, and the permissions are
   * numbered from 1, so the bit to read is one below the number. It is read
   * with division rather than a shift: JavaScript's bitwise operators work on
   * signed 32-bit integers, which is the wrong shape for a mask whose halves
   * run to 2^32 - 1.
   */
  public static hasPermission(
    mask: PermissionMask | null | undefined,
    permission: PermissionName,
  ): boolean {
    if (!mask) {
      return false;
    }

    const bit = PERMISSION_BITS[permission] - 1;
    const half = Number(bit < 32 ? (mask.Low ?? 0) : (mask.High ?? 0));

    if (!Number.isFinite(half)) {
      // An unreadable mask says nothing, so it is not taken as a refusal
      return false;
    }

    return Math.floor(half / Math.pow(2, bit % 32)) % 2 === 1;
  }

  /**
   * Turn the probed masks into the operations doctor performs. Pure, so the
   * mapping can be verified without a tenant.
   */
  public static toCapabilities(
    web: PermissionMask | null,
    pages: PermissionMask | null,
    assets: PermissionMask | null,
    reads: { termStore: boolean; siteUsers: boolean },
  ): Capabilities {
    const on = CapabilitiesHelper.hasPermission;

    // A mask that could not be read says nothing, so it is not a refusal — the
    // same rule the asset library already followed. Treating an unreadable Site
    // Pages mask as a denial turned a timeout on one probe request into "this
    // account cannot publish", which stops the run outright.
    const writesPages = pages
      ? on(pages, "addListItems") && on(pages, "editListItems")
      : true;

    return {
      determined: true,
      publishPages: writesPages,
      setMetadata: pages ? on(pages, "editListItems") : true,
      // A system update is a list-level operation, not an item one
      systemUpdate: pages ? on(pages, "manageLists") : true,
      manageNavigation: on(web, "manageWeb"),
      manageSiteDesign: on(web, "manageWeb"),
      writeAssets: assets
        ? on(assets, "addListItems") && on(assets, "editListItems")
        : true,
      readTermStore: reads.termStore,
      readSiteUsers: reads.siteUsers,
    };
  }

  /**
   * Ask the site what this account may do. Never throws: a probe that cannot
   * run leaves every capability assumed, so the publish behaves as it did
   * before this existed.
   */
  public static async probe(
    webUrl: string,
    options: CommandArguments,
  ): Promise<Capabilities> {
    const base = trimUrl(webUrl);
    const site = new URL(base).pathname.replace(/\/+$/, "");

    let headers: any;
    try {
      headers = {
        Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
        accept: "application/json;odata=nometadata",
      };
    } catch (e: any) {
      Logger.debug(`Capability probe skipped, no token: ${e?.message || e}`);
      CapabilitiesHelper.capabilities = { ...ALL };
      return CapabilitiesHelper.capabilities;
    }

    const read = async (url: string): Promise<any | null> => {
      try {
        return await ApiHelper.getOrThrow(url, headers);
      } catch (e: any) {
        Logger.debug(`Capability probe: ${url} → ${e?.message || e}`);
        return null;
      }
    };

    const web = await read(`${base}/_api/web/EffectiveBasePermissions`);
    if (!web) {
      // Not even the site's own permissions are readable, so nothing here can
      // be trusted. Attempt everything, as before.
      Logger.debug(`Capability probe could not read the site permissions.`);
      CapabilitiesHelper.capabilities = { ...ALL };
      return CapabilitiesHelper.capabilities;
    }

    const pages = await read(
      `${base}/_api/web/GetList('${encodeURIComponent(`${site}/SitePages`)}')/EffectiveBasePermissions`,
    );
    // Addressed by its server relative url, not by title: `--library` is a path
    // — `Shared Documents` is the folder, while the list is called `Documents`
    // — so GetByTitle answered 404 on a default site and the probe learnt
    // nothing about the library it is actually asked about.
    const assets = options.assetLibrary
      ? await read(
          `${base}/_api/web/GetList('${encodeURIComponent(`${site}/${options.assetLibrary.replace(/^\/+|\/+$/g, "")}`)}')/EffectiveBasePermissions`,
        )
      : null;

    const termStore = await read(`${base}/_api/v2.1/termStore?$select=id`);
    const siteUsers = await read(`${base}/_api/web/siteusers?$top=1&$select=Id`);

    CapabilitiesHelper.capabilities = CapabilitiesHelper.toCapabilities(
      web,
      pages,
      assets,
      { termStore: !!termStore, siteUsers: !!siteUsers },
    );

    Logger.debug(
      `Capabilities: ${JSON.stringify(CapabilitiesHelper.capabilities)}`,
    );
    return CapabilitiesHelper.capabilities;
  }

  /**
   * One line per operation, saying what the run will and will not do. Pure, and
   * only mentions the steps this run was actually going to take.
   *
   * Every line which says something is skipped has to be a step the publish
   * path really does skip, or the report is telling the reader something that
   * will not happen. The gates live in `publish.ts` (navigation, site design),
   * `PagesHelper.resolveMetadata` (columns and author), `DoctorTranspiler`
   * (pages which reference an image) and `StateHelper.save` (the state file).
   * Change a line here and change its gate with it.
   */
  public static describe(
    capabilities: Capabilities,
    options: CommandArguments,
  ): string[] {
    if (!capabilities.determined) {
      return [
        `Doctor could not read this site's permissions, so every step is attempted as usual.`,
      ];
    }

    const lines: string[] = [];
    const say = (able: boolean, what: string, consequence: string) =>
      lines.push(`${able ? "yes" : " no"}  ${what}${able ? "" : ` — ${consequence}`}`);

    say(
      capabilities.publishPages,
      "Publish pages",
      "nothing can be published, the run stops here",
    );
    say(
      capabilities.setMetadata,
      "Set page metadata",
      "the 'metadata' and 'author' front matter is skipped",
    );
    say(
      capabilities.writeAssets,
      `Upload assets to "${options.assetLibrary}"`,
      "the pages which reference an image are skipped, and the publish state is not saved",
    );
    say(
      capabilities.systemUpdate,
      "Update a page without changing its history",
      "page descriptions will change 'Modified' and 'Modified By'",
    );

    if (options.menu || options.cleanQuickLaunch || options.cleanTopNavigation) {
      say(
        capabilities.manageNavigation,
        "Manage the site navigation",
        "the 'menu' setting is skipped",
      );
    }

    if (options.siteDesign || options.applyTheme) {
      say(
        capabilities.manageSiteDesign,
        "Change the look of the site",
        "the 'siteDesign' setting is skipped",
      );
    }

    say(
      capabilities.readTermStore,
      "Read the term store",
      "pages with a managed metadata column are skipped",
    );
    say(
      capabilities.readSiteUsers,
      "Read the site users",
      "an 'author' given as a site user id is skipped; one given as a name is set without checking it exists",
    );

    return lines;
  }

  /**
   * Write the capability list to the console, once, before anything is
   * published. In JSON mode `info` writes nothing, and the capabilities travel
   * in the result document instead.
   */
  public static report(
    capabilities: Capabilities,
    options: CommandArguments,
  ): void {
    const lines = CapabilitiesHelper.describe(capabilities, options);

    OutputHelper.info(``);
    OutputHelper.info(` Available permissions on ${options.webUrl}:`);
    for (const line of lines) {
      OutputHelper.info(`   ${line}`);
    }
    OutputHelper.info(``);

    // The steps that will not run are worth repeating at the end of the run,
    // where the warnings are read
    for (const line of lines) {
      if (line.startsWith(" no")) {
        OutputHelper.warning(line.replace(/^ no\s+/, ""));
      }
    }
  }
}
