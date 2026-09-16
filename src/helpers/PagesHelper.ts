import {
  Page,
  PageTemplate,
  File,
  MarkdownSettings,
  CommandArguments,
  ControlSegment,
  ControlShortcodeContext,
  PageSegment,
  TaskOutput,
  MARKDOWN_WEB_PART_ID,
  STANDARD_WEB_PARTS,
} from "@models";
import {
  AccessToken,
  ApiHelper,
  CanvasHelper,
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  ListHelpers,
  Logger,
  OutputHelper,
  MarkdownHelper,
  MetadataHelper,
  ShortcodesHelpers,
  StateHelper,
  StatusHelper,
  TermsHelper,
  ResolvedTerm,
  WebPartControl,
} from "@helpers";
import { isPermissionError } from "@utils";
import { executeCommand } from "@pnp/cli-microsoft365";
import { randomUUID } from "crypto";
import { basename, dirname } from "path";

/**
 * The option names `spo listitem set` reads for itself. A column value under
 * one of these would be taken as the option rather than as a column.
 */
const RESERVED_LISTITEM_OPTIONS = new Set([
  "webUrl",
  "listId",
  "listTitle",
  "listUrl",
  "id",
  "contentType",
  "systemUpdate",
  "output",
  "debug",
  "verbose",
  "query",
  "help",
]);

interface FieldInfo {
  internalName: string;
  typeAsString: string;
  termSetId?: string;
  /**
   * A taxonomy column can be pinned to a sub-tree of its term set. Labels then
   * have to be resolved inside that sub-tree, which is also the only part of
   * the set the metadata editor's picker offers.
   */
  anchorId?: string;
}

export class PagesHelper {
  private static pages: File[] = [];
  private static processedPages: { [slug: string]: number } = {};
  /**
   * The pages this run knows are still wanted, but did not write — skipped as
   * unchanged, or skipped because their metadata could not be worked out.
   *
   * `processedPages` cannot carry these: it maps a slug to its list item id and
   * is what `getPageId` answers from, so a slug with no id has no business in
   * it. The cleanup pass needs them all the same, or a page that was merely
   * skipped is treated as one whose markdown file is gone, and recycled.
   */
  private static knownPages: Set<string> = new Set();
  private static listFieldMap: { [listId: string]: Map<string, FieldInfo> } = {};
  /** Set once the tenant refuses a CSOM system update, see setPageDescription */
  private static systemUpdateRefused = false;
  /** Set once a template was named for a page which already existed */
  private static templateSkipReported = false;
  /** The canvas of each page template, which does not change during a run */
  private static templateCanvas: { [name: string]: any[] | null } = {};

  /**
   * Reset all static state
   */
  public static reset(): void {
    PagesHelper.pages = [];
    PagesHelper.processedPages = {};
    PagesHelper.knownPages = new Set();
    PagesHelper.listFieldMap = {};
    PagesHelper.systemUpdateRefused = false;
    PagesHelper.templateSkipReported = false;
    PagesHelper.templateCanvas = {};
  }

  /**
   * Retrieve all the pages from the current site
   * @param webUrl
   */
  public static async getAllPages(webUrl: string): Promise<void> {
    Logger.debug(`Retrieving all the existing pages from the site: ${webUrl}`);

    PagesHelper.pages = await FileHelpers.getAllPages(webUrl, "sitepages");
    Logger.debug(`Existing pages`);
    Logger.debug(PagesHelper.pages);
  }

  /**
   * Cleaning up all the untouched pages
   * @param webUrl
   * @param task
   * @param options
   */
  public static async clean(
    webUrl: string,
    task: TaskOutput,
    options: CommandArguments
  ): Promise<void> {
    const untouched = this.getUntouchedPages().filter(
      (slug) =>
        !slug.toLowerCase().startsWith("templates") &&
        slug.endsWith(".aspx")
    );
    Logger.debug(`Removing the following files`);
    Logger.debug(untouched);
    for (const slug of untouched) {
      try {
        if (slug) {
          Logger.debug(`Cleaning up page: ${slug}`);
          task.output = `Cleaning up page: ${slug}`;
          const filePath = `sitepages/${slug}`;
          const relUrl = FileHelpers.getRelUrl(webUrl, filePath);
          await executeWithRetry(
            "spo file remove",
            {
              webUrl,
              url: relUrl,
              force: true,
            },
            CliCommand.getRetry()
          );
        }
      } catch (e) {
        const errorMessage =
          typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
        Logger.debug(errorMessage);

        if (!options.continueOnError) {
          throw new Error(errorMessage);
        }
      }
    }
  }

  /**
  * Recycle the pages which are tracked in the publish state, but whose markdown
  * file no longer exists. The pages end up in the site its recycle bin, so they
  * can still be restored from SharePoint itself.
  * @param webUrl
  * @param slugs The slugs of the pages to recycle
  * @param task
  * @param options
  * @param onRemoved Called for every page which got recycled, also when a later
  * page fails, so the publish state can be kept in sync with the site.
  * @returns The slugs which are no longer on the site
  */
  public static async removePages(
   webUrl: string,
   slugs: string[],
   task: TaskOutput,
   options: CommandArguments,
   onRemoved?: (slug: string) => void
  ): Promise<string[]> {
   const removed: string[] = [];

   Logger.debug(`Recycling the following deleted pages`);
   Logger.debug(slugs);

   for (let i = 0; i < slugs.length; i++) {
     const slug = slugs[i];
     if (!slug) {
       continue;
     }

     task.output = `[${i + 1}/${slugs.length}] Recycling deleted page: ${slug}`;

     try {
       const relUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);
       await executeWithRetry(
         "spo file remove",
         {
           webUrl,
           url: relUrl,
           recycle: true,
           force: true,
         },
         CliCommand.getRetry()
       );

       removed.push(slug);
       onRemoved?.(slug);
     } catch (e) {
       const errorMessage =
         typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
       Logger.debug(errorMessage);

       // The page is already gone from the site, so the state can drop it as well.
       if (this.isNotFoundError(errorMessage)) {
         Logger.debug(`Page ${slug} no longer exists on the site.`);
         removed.push(slug);
         onRemoved?.(slug);
         continue;
       }

       // Prefixed with the library, so the summary shows it is a page on the
       // site which failed, and not a local file.
       StatusHelper.addError(`sitepages/${slug}`);

       if (!options.continueOnError) {
         throw new Error(
           `Failed to recycle the deleted page "${slug}". ${errorMessage}`
         );
       }
     }
   }

   return removed;
  }

  /**
  * Check if the page exists, and if it doesn't it will be created
  * @param webUrl
  * @param slug
  * @param title
  */
  public static async createPageIfNotExists(
   webUrl: string,
   slug: string,
   title: string,
   layout: string = "Article",
   commentsDisabled: boolean = false,
    description: string = "",
    template: string | null = null,
    skipExistingPages: boolean = false,
    reapplyTemplates: boolean = false
  ): Promise<boolean> {
    try {
      const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);

      if (skipExistingPages) {
        if (PagesHelper.pages && PagesHelper.pages.length > 0) {
          const page = PagesHelper.pages.find(
            (page: File) =>
              page.FileRef?.toLowerCase() === relativeUrl.toLowerCase()
          );
          if (page) {
            // Page already existed
            PagesHelper.processedPages[slug] = page.ID;
            Logger.debug(
              `Processed pages: ${JSON.stringify(PagesHelper.processedPages)}`
            );
            return true;
          }
        }
      }

      const { stdout: pageDataOutput } = await executeCommand("spo page get", {
        webUrl,
        name: slug,
        metadataOnly: true,
        output: "json",
      });
      let pageData: Page = JSON.parse(pageDataOutput);

      PagesHelper.processedPages[slug] = (
        pageData as Page
      ).ListItemAllFields.Id;
      Logger.debug(
        `Processed pages: ${JSON.stringify(PagesHelper.processedPages)}`
      );

      Logger.debug(pageData);

      const setOptions: any = {
        webUrl,
        name: slug,
      };

      if (pageData && (pageData as Page).title !== title) {
        setOptions.title = title;
      }

      if (pageData && description) {
        setOptions.description = description;
      }

      if (pageData && (pageData as Page).layoutType !== layout) {
        setOptions.layoutType = layout;
      }

      if (
        pageData &&
        (pageData as Page).commentsDisabled !== commentsDisabled
      ) {
        setOptions.commentsEnabled = !commentsDisabled;
      }

      if (Object.keys(setOptions).length > 2) {
        await executeWithRetry(
          "spo page set",
          setOptions,
          CliCommand.getRetry()
        );
      }

      // A template is applied when doctor creates the page. Reaching here means
      // the page already existed, so it keeps the layout it has — which is easy
      // to mistake for the template name being wrong.
      if (template && !reapplyTemplates && !PagesHelper.templateSkipReported) {
        PagesHelper.templateSkipReported = true;
        OutputHelper.warning(
          `The page template "${template}" is only applied to pages doctor creates, and "${slug}" already exists — it keeps the layout it has. Delete the page in SharePoint and publish again to build it from the template. Pages created from here on do use it.`
        );
      }

      return true;
    } catch (e) {
      // Check if folders for the file need to be created
      if (slug.split("/").length > 1) {
        const folders = slug.split("/");
        await FolderHelpers.create(
          "sitepages",
          folders.slice(0, folders.length - 1),
          webUrl
        );
      }

      if (template) {
        const { stdout: templatesOutput } = await executeWithRetry(
          "spo page template list",
          {
            webUrl,
            output: "json",
          },
          CliCommand.getRetry()
        );
        let templates: PageTemplate[] = JSON.parse(templatesOutput || "[]");

        Logger.debug(templates);

        const pageTemplate = PagesHelper.findPageTemplate(templates, template);
        if (pageTemplate) {
          const templateUrl = pageTemplate.Url.toLowerCase().replace(
            "sitepages/",
            ""
          );
          await executeWithRetry(
            "spo page copy",
            {
              webUrl,
              sourceName: templateUrl,
              targetUrl: slug,
            },
            CliCommand.getRetry()
          );
          await executeWithRetry(
            "spo page set",
            {
              webUrl,
              name: slug,
              publish: true,
            },
            CliCommand.getRetry()
          );
          return await this.createPageIfNotExists(
            webUrl,
            slug,
            title,
            layout,
            commentsDisabled,
            description,
            null,
            skipExistingPages
          );
        } else {
          // Not fatal — the page is still published, just without the
          // template's sections — but silence would leave every page from this
          // point quietly looking wrong
          OutputHelper.warning(
            `The page template "${template}" does not exist on the site, so "${slug}" was created as an ordinary page. The site has: ${
              templates.length > 0
                ? templates
                    .map((t) => `"${t.Title}"${t.FileName ? ` (${t.FileName})` : ""}`)
                    .join(", ")
                : "no page templates"
            }.`
          );
        }
      }

      // File doesn't exist
      const pageName = basename(slug);
      try {
        await executeWithRetry(
          "spo page add",
          {
            webUrl,
            name: pageName,
            title,
            layoutType: layout,
            commentsEnabled: !commentsDisabled,
            description,
          },
          CliCommand.getRetry()
        );
      } catch (e: any) {
        if (!this.isAlreadyExistsError(e)) {
          throw e;
        }

        Logger.debug(
          `Page ${pageName} already exists at Site Pages root. Continuing with move/update flow.`
        );
      }

      if (slug !== pageName) {
        const targetFolder = dirname(slug).replace(/\\/g, "/");
        const pageList = await ListHelpers.getSitePagesList(webUrl);
        const sitePagesRoot =
          pageList?.RootFolder?.ServerRelativeUrl ||
          FileHelpers.getRelUrl(webUrl, "sitepages");

        await this.ensureFolderPath(webUrl, sitePagesRoot, targetFolder);

        const sourceUrl = `${sitePagesRoot}/${pageName}`;
        const targetUrl = `${sitePagesRoot}/${targetFolder}`;

        Logger.debug(
          `Moving page from ${sourceUrl} to ${targetUrl} with name ${pageName}`
        );

        await executeWithRetry(
          "spo file move",
          {
            webUrl,
            sourceUrl,
            targetUrl,
            newName: pageName,
            nameConflictBehavior: "replace",
          },
          CliCommand.getRetry()
        );
      }

      return false;
    }
  }

  private static async ensureFolderPath(
    webUrl: string,
    rootFolder: string,
    relativePath: string
  ): Promise<void> {
    const segments = (relativePath || "").split("/").filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let currentFolder = rootFolder;

    for (const segment of segments) {
      try {
        await executeWithRetry(
          "spo folder add",
          {
            webUrl,
            parentFolderUrl: currentFolder,
            name: segment,
          },
          CliCommand.getRetry()
        );
      } catch (e: any) {
        if (!this.isAlreadyExistsError(e)) {
          throw e;
        }
      }

      currentFolder = `${currentFolder}/${segment}`;
    }
  }

  private static isAlreadyExistsError(error: any): boolean {
    const message =
      typeof error === "string"
        ? error
        : error?.message || JSON.stringify(error);
    const normalized = (message || "").toLowerCase();

    return (
      normalized.includes("already exists") ||
      normalized.includes("file exists") ||
      normalized.includes("folder exists")
    );
  }

  /**
   * Write the page's controls: one Markdown web part per markdown segment and
   * one web part per control shortcode, in the order they appear in the source.
   *
   * The whole canvas is composed and written in one call rather than looping
   * the CLI's add/set/remove commands, because those cannot move an existing
   * control and each of them re-saves and republishes the page.
   */
  public static async applySegments(
    webPartTitle: string,
    segments: PageSegment[],
    slug: string,
    webUrl: string,
    options: CommandArguments,
    mdOptions: MarkdownSettings | null,
    wasAlreadyParsed: boolean = false,
    context: ControlShortcodeContext | null = null,
    templateCanvas: any[] | null = null
  ) {
    const hasControls = segments.some((segment) => segment.type === "control");

    Logger.debug(
      `Writing ${segments.length} segment(s) for the page ${slug} - Was already parsed: ${wasAlreadyParsed}`
    );

    // The state file is the only record of which controls are doctor's. Without
    // it a control shortcode's web part cannot be told apart from one the page
    // owner added, so a re-publish would add a second one on every run.
    if (hasControls && options.disableStatePersistence) {
      throw new Error(
        `The page "${slug}" uses a control shortcode, which needs the publish state to recognise its web parts on a next run. Remove '--disableStatePersistence' to publish it.`
      );
    }

    const page = await CanvasHelper.checkout(webUrl, slug);
    const existing: any[] = page?.CanvasContent1
      ? JSON.parse(page.CanvasContent1)
      : [];

    const ownership = {
      ownedInstanceIds: StateHelper.getControls(slug),
      ownedTitlePrefix: webPartTitle,
    };

    // Reuse the instance id of a control of the same type, so SharePoint keeps
    // the control rather than seeing it removed and a new one added
    const reusable: { [webPartId: string]: string[] } = {};
    for (const control of CanvasHelper.getOwned(existing, ownership)) {
      const key = (control.webPartId || "").toLowerCase();
      (reusable[key] = reusable[key] || []).push(control.id);
    }
    // Generated here rather than inside compose(), so the ids recorded in the
    // state file are exactly the ones that end up on the page
    const takeInstanceId = (webPartId: string): string =>
      reusable[webPartId.toLowerCase()]?.shift() ?? randomUUID();

    const controls: WebPartControl[] = [];
    let markdownSegment = 0;

    for (const segment of segments) {
      if (segment.type === "markdown") {
        const index = markdownSegment++;
        const title = PagesHelper.getSegmentTitle(webPartTitle, index);

        controls.push({
          webPartId: MARKDOWN_WEB_PART_ID,
          webPartData: await MarkdownHelper.getWebPartData(
            title,
            segment.content,
            mdOptions,
            options,
            wasAlreadyParsed,
            index === 0
          ),
          instanceId: takeInstanceId(MARKDOWN_WEB_PART_ID),
        });
      } else {
        const webPartId = await PagesHelper.getControlWebPart(
          segment,
          webUrl,
          slug,
          context
        );

        controls.push({
          webPartId: webPartId.id,
          webPartData: webPartId.data,
          instanceId: takeInstanceId(webPartId.id),
        });
      }
    }

    // Compose from the page as it stands at the moment of writing. A save that
    // is refused because the page moved on is worth one more attempt from a
    // fresh checkout — the controls are already built, so only the canvas they
    // are placed into is read again.
    //
    // With a template being re-applied, the layout composed into is the
    // template's rather than the page's. The page's own controls are still
    // matched against its real canvas above, so they keep their identity.
    const writeCanvas = async (current: any[]) => {
      const base = templateCanvas
        ? CanvasHelper.mergeTemplate(templateCanvas, current, ownership)
        : current;

      await CanvasHelper.save(
        webUrl,
        slug,
        CanvasHelper.compose(base, controls, ownership)
      );
    };

    try {
      await writeCanvas(existing);
    } catch (e: any) {
      if (!CanvasHelper.isSaveConflict(e)) {
        throw e;
      }

      Logger.debug(
        `SharePoint refused the canvas of ${slug} as a conflict, retrying from a fresh checkout.`
      );

      const retry = await CanvasHelper.checkout(webUrl, slug);
      await writeCanvas(
        retry?.CanvasContent1 ? JSON.parse(retry.CanvasContent1) : []
      );
    }

    StateHelper.setControls(
      slug,
      controls.map((control) => control.instanceId as string)
    );
  }

  /**
   * The title doctor gives the Markdown web part of a segment. The first keeps
   * `--webPartTitle` so a page that was published before this existed still
   * matches its own control.
   */
  private static getSegmentTitle(webPartTitle: string, index: number): string {
    return index === 0 ? webPartTitle : `${webPartTitle} (${index + 1})`;
  }

  /**
   * Ask a control shortcode which web part it becomes, and build the data for
   * a new instance of it.
   */
  private static async getControlWebPart(
    segment: ControlSegment,
    webUrl: string,
    slug: string,
    context: ControlShortcodeContext | null
  ): Promise<{ id: string; data: any }> {
    const shortcode = ShortcodesHelpers.getControl(segment.shortcode);
    if (!shortcode) {
      throw new Error(
        `The "${segment.shortcode}" control shortcode used on "${slug}" is not registered. Check the 'markdown.shortcodesFolder' setting.`
      );
    }

    const result = await shortcode.render(
      segment.attributes,
      context ?? { frontMatter: {}, slug, webUrl }
    );

    if (!result || (!result.standardWebPart && !result.webPartId)) {
      throw new Error(
        `The "${segment.shortcode}" control shortcode has to return a 'standardWebPart' name or a 'webPartId'.`
      );
    }

    const id = result.standardWebPart
      ? PagesHelper.getStandardWebPartId(result.standardWebPart)
      : (result.webPartId as string);

    const data = await CanvasHelper.getWebPartData(
      webUrl,
      id,
      result.webPartProperties ?? null
    );

    // Whatever the shortcode returns wins over the web part's defaults, the
    // same way the CLI merges its `--webPartData`
    const merged = result.webPartData
      ? { ...data, ...result.webPartData }
      : data;

    if (result.title) {
      merged.title = result.title;
    }

    // The instance is doctor's to place, so it cannot be pinned by a shortcode
    delete merged.id;
    delete merged.instanceId;

    return { id, data: merged };
  }

  /**
   * Resolve an out-of-the-box web part name to its id
   */
  private static getStandardWebPartId(name: string): string {
    const match = STANDARD_WEB_PARTS.find(
      (webPart) => webPart.name.toLowerCase() === name.toLowerCase()
    );

    if (!match) {
      throw new Error(
        `"${name}" is not a standard web part. Use one of: ${STANDARD_WEB_PARTS.map(
          (webPart) => webPart.name
        )
          .filter((value, index, all) => all.indexOf(value) === index)
          .join(", ")}.`
      );
    }

    return match.id;
  }

  /**
   * Set the page its metadata
   * @param webUrl
   * @param slug
   * @param metadata
   */
  /**
   * Work out what every metadata column should be set to, without touching the
   * page.
   *
   * This runs before anything is written, so a page whose front matter names a
   * term that is not in the set, an author who is not a user of the site, or a
   * column that does not exist is left exactly as it was rather than ending up
   * with new content and stale metadata.
   *
   * @returns the values to write, and the reason for every column that could
   * not be worked out
   */
  public static async resolveMetadata(
    webUrl: string,
    slug: string,
    metadata: { [fieldName: string]: any } | null = null,
    author: any = undefined
  ): Promise<{ values: { [fieldName: string]: any }; problems: string[] }> {
    const hasMetadata = !!metadata && Object.keys(metadata).length > 0;
    const hasAuthor = typeof author !== "undefined" && author !== null;

    if (!hasMetadata && !hasAuthor) {
      return { values: {}, problems: [] };
    }

    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (!pageList) {
      return {
        values: {},
        problems: [`the Site Pages library of ${webUrl} could not be read`],
      };
    }

    const { values, problems } = hasMetadata
      ? await this.getValidatedMetadata(webUrl, pageList, metadata as any)
      : { values: {}, problems: [] as string[] };

    if (hasAuthor) {
      // `Author` is SharePoint's own created-by column, which takes a claim
      // like any other person field — not the site user id the front matter
      // carries, so the id is resolved to its login name first.
      try {
        values["Author"] =
          `[{'Key':'${await this.resolveAuthorClaim(webUrl, author, slug)}'}]`;
      } catch (e: any) {
        problems.push(e?.message || `${e}`);
      }
    }

    return { values, problems };
  }

  /**
   * Set the metadata worked out by `resolveMetadata`
   */
  public static async writeMetadata(
    webUrl: string,
    slug: string,
    values: { [fieldName: string]: any }
  ): Promise<void> {
    if (Object.keys(values).length === 0) {
      return;
    }

    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);

    if (!pageId || !pageList) {
      throw new Error(
        `The metadata of "${slug}" could not be set, because the page was not found in the Site Pages library.`
      );
    }

    // The column values are spread into the command's own options, so a column
    // whose internal name is one of them would silently point the update
    // somewhere else — at another site, or another list item
    const reserved = Object.keys(values).filter((name) =>
      RESERVED_LISTITEM_OPTIONS.has(name)
    );
    if (reserved.length > 0) {
      throw new Error(
        `The column(s) ${reserved.join(", ")} cannot be set by doctor, because the name is one the CLI uses for its own options.`
      );
    }

    await executeWithRetry(
      "spo listitem set",
      {
        listId: pageList.Id,
        id: pageId,
        webUrl,
        ...values,
      },
      CliCommand.getRetry()
    );
  }

  private static async getValidatedMetadata(
    webUrl: string,
    pageList: any,
    metadata: { [fieldName: string]: any }
  ): Promise<{ values: { [fieldName: string]: any }; problems: string[] }> {
    const listId = pageList?.Id;
    let fieldMap = this.listFieldMap[listId];

    if (!fieldMap) {
      const { stdout } = await executeWithRetry(
        "spo field list",
        {
          webUrl,
          ...(pageList?.RootFolder?.ServerRelativeUrl
            ? { listUrl: pageList.RootFolder.ServerRelativeUrl }
            : { listTitle: pageList?.Title }),
          output: "json",
        },
        CliCommand.getRetry()
      );

      const fields = JSON.parse(stdout || "[]") as any[];
      fieldMap = new Map<string, FieldInfo>();

      for (const field of fields) {
        // An unset anchor comes back as the empty guid rather than absent
        const anchorId =
          field.AnchorId &&
          field.AnchorId !== "00000000-0000-0000-0000-000000000000"
            ? field.AnchorId
            : undefined;

        const fieldInfo: FieldInfo = {
          internalName: field.InternalName || field.StaticName || field.Title,
          typeAsString: field.TypeAsString || "",
          termSetId: field.TermSetId,
          ...(anchorId ? { anchorId } : {}),
        };

        if (!fieldInfo.internalName) {
          continue;
        }

        if (field?.InternalName) {
          fieldMap.set(field.InternalName.toLowerCase(), fieldInfo);
        }

        if (field?.StaticName) {
          fieldMap.set(field.StaticName.toLowerCase(), fieldInfo);
        }

        if (field?.Title) {
          fieldMap.set(field.Title.toLowerCase(), fieldInfo);
        }
      }

      this.listFieldMap[listId] = fieldMap;
    }

    const values: { [fieldName: string]: any } = {};
    const problems: string[] = [];

    for (const [key, value] of Object.entries(metadata)) {
      const fieldInfo = fieldMap.get(key.toLowerCase());

      if (!fieldInfo?.internalName) {
        problems.push(
          `the column '${key}' does not exist on the Site Pages library`
        );
        continue;
      }

      let transformed: any;
      try {
        transformed = await this.transformMetadataValue(
          webUrl,
          fieldInfo,
          value
        );
      } catch (e: any) {
        problems.push(`the column '${key}' could not be set: ${e?.message || e}`);
        continue;
      }

      if (typeof transformed === "undefined") {
        problems.push(
          `the column '${key}' does not accept ${JSON.stringify(value)}`
        );
        continue;
      }

      values[fieldInfo.internalName] = transformed;
    }

    return { values, problems };
  }

  private static async transformMetadataValue(
    webUrl: string,
    fieldInfo: FieldInfo,
    value: any
  ): Promise<any> {
    const typeAsString = fieldInfo.typeAsString || "";

    if (
      !typeAsString ||
      MetadataHelper.SIMPLE_FIELD_TYPES.has(typeAsString)
    ) {
      return value;
    }

    switch (typeAsString) {
      case "TaxonomyFieldType":
        return await this.transformTaxonomySingle(webUrl, fieldInfo, value);
      case "TaxonomyFieldTypeMulti":
        return await this.transformTaxonomyMulti(webUrl, fieldInfo, value);
      case "User":
        return MetadataHelper.toUserClaim(value);
      case "UserMulti":
        return MetadataHelper.toUserClaims(value);
      case "DateTime":
        return MetadataHelper.transformDateTime(value);
      case "Lookup":
        return MetadataHelper.transformLookupSingle(
          value,
          fieldInfo.internalName
        );
      case "LookupMulti":
        return MetadataHelper.transformLookupMulti(
          value,
          fieldInfo.internalName
        );
      case "URL":
        return MetadataHelper.transformUrl(value);
      case "MultiChoice":
        return MetadataHelper.transformMultiChoice(value);
      default:
        return value;
    }
  }

  private static async transformTaxonomySingle(
    webUrl: string,
    fieldInfo: FieldInfo,
    value: any
  ): Promise<string | undefined> {
    const term = MetadataHelper.normalizeTaxonomyTerm(value);
    if (!term) {
      Logger.debug(
        `Skipping taxonomy field '${fieldInfo.internalName}' because the value is invalid.`
      );
      return undefined;
    }

    return await this.toTaxonomyValue(webUrl, fieldInfo, term);
  }

  private static async transformTaxonomyMulti(
    webUrl: string,
    fieldInfo: FieldInfo,
    value: any
  ): Promise<string | undefined> {
    const values = Array.isArray(value) ? value : [value];
    const terms: string[] = [];

    for (const entry of values) {
      const term = MetadataHelper.normalizeTaxonomyTerm(entry);

      // Every entry counts. Dropping the ones that cannot be read and writing
      // the rest would leave the column holding a list the markdown never
      // said, which is the one outcome "the file is the page" rules out.
      if (!term) {
        throw new Error(
          `${JSON.stringify(entry)} is not a term label or a { label, termGuid } pair`
        );
      }

      terms.push(await this.toTaxonomyValue(webUrl, fieldInfo, term));
    }

    return MetadataHelper.joinTaxonomyValues(terms);
  }

  /**
   * The `Label|Guid` pair SharePoint stores a term as. The label has to be the
   * term's own, not what the author wrote — those differ when a term was
   * addressed by its path or by one of its other labels.
   */
  private static async toTaxonomyValue(
    webUrl: string,
    fieldInfo: FieldInfo,
    term: { label: string; termGuid?: string }
  ): Promise<string> {
    if (term.termGuid) {
      return MetadataHelper.toTaxonomyValue(term.label, term.termGuid);
    }

    const resolved = await this.resolveTerm(webUrl, fieldInfo, term.label);
    return MetadataHelper.toTaxonomyValue(resolved.label, resolved.id);
  }

  /**
   * The canvas of a page template, read once per run.
   *
   * Returns null when the template cannot be found or read, which leaves the
   * page with the layout it has rather than failing over it.
   */
  public static async getTemplateCanvas(
    webUrl: string,
    template: string
  ): Promise<any[] | null> {
    const key = template.toLowerCase();

    if (key in PagesHelper.templateCanvas) {
      return PagesHelper.templateCanvas[key];
    }

    PagesHelper.templateCanvas[key] = null;

    try {
      const { stdout } = await executeWithRetry(
        "spo page template list",
        { webUrl, output: "json" },
        CliCommand.getRetry()
      );

      const found = PagesHelper.findPageTemplate(
        JSON.parse(stdout || "[]") as PageTemplate[],
        template
      );

      if (!found) {
        Logger.debug(`Page template "${template}" not found on ${webUrl}.`);
        return null;
      }

      const name = found.Url.toLowerCase().replace("sitepages/", "");
      const page = await CanvasHelper.read(webUrl, name);

      PagesHelper.templateCanvas[key] = page?.CanvasContent1
        ? JSON.parse(page.CanvasContent1)
        : null;

      Logger.debug(
        `Read the canvas of page template "${template}" (${name}).`
      );
    } catch (e: any) {
      Logger.debug(
        `Could not read the canvas of page template "${template}": ${e?.message || e}`
      );
    }

    return PagesHelper.templateCanvas[key];
  }

  /**
   * Find the page template the front matter asks for.
   *
   * Its title is what a template is named by, but the title is a display value
   * that rarely matches the file somebody sees in the URL, so the file name and
   * the page id are accepted too — `Documentation Template`,
   * `Documentation-Template`, `Documentation-Template.aspx` and `144` all find
   * the same template.
   */
  public static findPageTemplate(
    templates: PageTemplate[],
    wanted: string
  ): PageTemplate | undefined {
    const byTitle = templates.find((t) => t.Title === wanted);
    if (byTitle) {
      return byTitle;
    }

    const normalized = wanted.trim().toLowerCase().replace(/\.aspx$/, "");
    const matches = (value: string | undefined) =>
      !!value && value.trim().toLowerCase().replace(/\.aspx$/, "") === normalized;

    return templates.find(
      (t) =>
        matches(t.Title) ||
        matches(t.FileName) ||
        (/^\d+$/.test(normalized) && t.Id === parseInt(normalized, 10))
    );
  }

  /**
   * Turn the `author` front matter into the claim SharePoint's Author column
   * expects.
   *
   * The site user id is read back from `_api/web/siteusers` — the same list the
   * metadata editor's picker searched to produce it, so both sides agree on
   * what an id means. That list is per site: a user only has an id on a site
   * they are a member of or have visited, and the id differs from site to site.
   */
  private static async resolveAuthorClaim(
    webUrl: string,
    author: any,
    slug: string
  ): Promise<string> {
    const siteUserId =
      typeof author === "number"
        ? author
        : typeof author === "string" && /^\d+$/.test(author.trim())
          ? parseInt(author.trim(), 10)
          : null;

    if (siteUserId === null) {
      if (typeof author === "string" && author.includes("@")) {
        return await PagesHelper.resolveUpnClaim(webUrl, author);
      }

      throw new Error(
        `The 'author' of "${slug}" has to be a SharePoint site user id (a number) or a user principal name, but was '${author}'.`
      );
    }

    const base = webUrl.replace(/\/+$/, "");
    const headers = {
      Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
      accept: "application/json;odata=nometadata",
    };

    // Filtered rather than GetById(), so the id is looked up in exactly the
    // collection the site lists — GetById refuses ids that are plainly in it
    const filter = encodeURIComponent(`Id eq ${siteUserId}`);
    let user: any;

    try {
      const response = await ApiHelper.getOrThrow(
        `${base}/_api/web/siteusers?$filter=${filter}&$select=Id,Title,LoginName`,
        headers
      );
      user = response?.value?.[0];
    } catch (e: any) {
      // Keep what SharePoint said: a failure to read the list is a different
      // problem from an id that is not in it
      throw new Error(
        `The 'author' of "${slug}" could not be resolved: the users of ${base} could not be read. ${e?.message || e}`
      );
    }

    const loginName = user?.LoginName;
    if (!loginName) {
      throw new Error(
        `The 'author' of "${slug}" is site user id ${siteUserId}, which is not a user of ${base}. ${await PagesHelper.getSiteUserHint(base, headers)}`
      );
    }

    // The login name already is the claim, which keeps guest and group
    // accounts working — their claims are not the membership shape
    return loginName;
  }

  /**
   * The claim for a user named by principal name.
   *
   * The site is asked first, because the login name it already holds is the
   * claim it will compare against — and for a guest or a group that is not the
   * `i:0#.f|membership|` shape a principal name is assembled into. A user the
   * site has never seen has no entry yet and is not an error: SharePoint adds
   * one when the column is written. That is also why this cannot verify the
   * name exists, and why an unknown one is a failure on the page rather than a
   * skip — the difference between "not here yet" and "does not exist" is not
   * one the site can answer.
   */
  private static async resolveUpnClaim(
    webUrl: string,
    upn: string
  ): Promise<string> {
    const base = webUrl.replace(/\/+$/, "");
    const wanted = upn.trim();

    try {
      const filter = encodeURIComponent(
        `Email eq '${wanted.replace(/'/g, "''")}'`
      );
      const response = await ApiHelper.getOrThrow(
        `${base}/_api/web/siteusers?$filter=${filter}&$select=Id,LoginName`,
        {
          Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
          accept: "application/json;odata=nometadata",
        }
      );

      const loginName = response?.value?.[0]?.LoginName;
      if (loginName) {
        Logger.debug(`Resolved '${wanted}' to the site user ${loginName}.`);
        return loginName;
      }
    } catch (e: any) {
      Logger.debug(
        `Could not look up '${wanted}' in the site users: ${e?.message || e}`
      );
    }

    return MetadataHelper.toClaimKey(wanted) as string;
  }

  /**
   * A few of the site's actual users, so a wrong author id says what the right
   * ones would be instead of only that the lookup failed.
   */
  private static async getSiteUserHint(
    base: string,
    headers: any
  ): Promise<string> {
    try {
      const response = await ApiHelper.getOrThrow(
        `${base}/_api/web/siteusers?$select=Id,Title,Email&$filter=PrincipalType eq 1&$top=5`,
        headers
      );

      const users: any[] = response?.value || [];
      if (users.length === 0) {
        return `The site has no users to pick from — check that you are publishing to the site you picked the author on.`;
      }

      return `Ids on this site look like: ${users
        .map((entry) => `${entry.Id} (${entry.Title || entry.Email || "?"})`)
        .join(", ")}. The full list is at ${base}/_api/web/siteusers. Remember an id is per site, so one picked on another site does not carry over — a user principal name works on any site.`;
    } catch {
      return `The full list is at ${base}/_api/web/siteusers. Remember an id is per site, so one picked on another site does not carry over — a user principal name works on any site.`;
    }
  }

  private static async resolveTerm(
    webUrl: string,
    fieldInfo: FieldInfo,
    label: string
  ): Promise<ResolvedTerm> {
    const termSetId = fieldInfo.termSetId;
    if (!termSetId) {
      throw new Error(
        `The taxonomy column '${fieldInfo.internalName}' has no TermSetId, so the term "${label}" cannot be resolved.`
      );
    }

    return await TermsHelper.resolve(
      webUrl,
      termSetId,
      label,
      fieldInfo.anchorId
    );
  }

  /**
   * Set the page its description
   * @param webUrl
   * @param slug
   * @param description
   */
  public static async setPageDescription(
    webUrl: string,
    slug: string,
    description: string
  ) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);

    if (!pageId || !pageList) {
      return;
    }

    const item = {
      listId: pageList.Id,
      id: pageId,
      webUrl,
      Description: description,
    };

    // A system update leaves Modified and Modified By alone, which is what a
    // description belongs in. It goes through CSOM though, and a tenant can
    // refuse that to an app which is otherwise allowed to edit the page — so
    // rather than losing the description, fall back to a normal update and say
    // what that costs. Once refused it stays refused for the run, so the other
    // pages do not each pay for the same doomed call.
    if (!PagesHelper.systemUpdateRefused) {
      try {
        await executeWithRetry(
          "spo listitem set",
          { ...item, systemUpdate: true },
          CliCommand.getRetry()
        );
        return;
      } catch (e: any) {
        // Only a refusal is permanent. A timeout, a throttle or a dropped
        // connection says nothing about what the account may do, and taking it
        // as a refusal would change 'Modified' and 'Modified By' on every page
        // for the rest of the run — while telling the user they lack a
        // permission they have.
        if (!isPermissionError(e)) {
          throw e;
        }

        PagesHelper.systemUpdateRefused = true;
        Logger.debug(
          `System update refused on ${webUrl}: ${e?.message || e}`
        );
        OutputHelper.warning(
          `This account is not allowed to update a page without touching its history, so page descriptions are set with a normal update instead. The pages get their description, but their "Modified" date and "Modified By" change with it. Granting the account permission to run a system update on the Site Pages library avoids that.`
        );
      }
    }

    await executeWithRetry(
      "spo listitem set",
      item,
      CliCommand.getRetry()
    );
  }

  /**
   * Publish the page
   * @param webUrl
   * @param slug
   */
  public static async publishPageIfNeeded(webUrl: string, slug: string) {
    const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);
    try {
          await executeCommand("spo file checkin", {
            webUrl,
            url: relativeUrl,
          });
    } catch (e) {
      // Might be that the file doesn't need to be checked in
    }
    await executeWithRetry(
      "spo page set",
      {
        name: slug,
        webUrl,
        publish: true,
      },
      CliCommand.getRetry()
    );
  }

  /**
   * Retrieve the page id
   * @param webUrl
   * @param slug
   */
  private static async getPageId(webUrl: string, slug: string) {
    if (!PagesHelper.processedPages[slug.toLowerCase()]) {
      const { stdout } = await executeWithRetry(
        "spo page get",
        {
          webUrl,
          name: slug,
          metadataOnly: true,
          output: "json",
        },
        CliCommand.getRetry()
      );
      if (stdout) {
        const pageData = JSON.parse(stdout);

        Logger.debug(pageData);

        if (pageData.ListItemAllFields && pageData.ListItemAllFields.Id) {
          PagesHelper.processedPages[slug.toLowerCase()] =
            pageData.ListItemAllFields.Id;
          return PagesHelper.processedPages[slug.toLowerCase()];
        }

        return null;
      }
    }

    return PagesHelper.processedPages[slug.toLowerCase()];
  }

  /**
   * Receive all the pages which have not been touched
   */
  /**
   * Record a page this run is keeping but did not write, so the cleanup pass
   * leaves it alone
   * @param slug
   */
  public static markKnown(slug: string): void {
    if (slug) {
      PagesHelper.knownPages.add(slug.toLowerCase());
    }
  }

  private static getUntouchedPages(): string[] {
    let untouched: string[] = [];
    for (const page of PagesHelper.pages) {
      const { FileRef: url } = page;
      if (!url) {
        continue;
      }
      const slug = url.toLowerCase().split("/sitepages/")[1];
      if (!PagesHelper.processedPages[slug] && !PagesHelper.knownPages.has(slug)) {
        untouched.push(slug);
      }
    }
    return untouched;
  }

  private static isNotFoundError(message: string): boolean {
    const normalized = (message || "").toLowerCase();

    return (
      normalized.includes("does not exist") ||
      normalized.includes("not exist") ||
      normalized.includes("file not found") ||
      normalized.includes("cannot be found") ||
      normalized.includes("404")
    );
  }

}
