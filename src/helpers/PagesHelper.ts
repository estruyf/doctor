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
  CanvasHelper,
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  ListHelpers,
  Logger,
  MarkdownHelper,
  MetadataHelper,
  ShortcodesHelpers,
  StateHelper,
  StatusHelper,
  TermsHelper,
  ResolvedTerm,
  WebPartControl,
} from "@helpers";
import { executeCommand } from "@pnp/cli-microsoft365";
import { randomUUID } from "crypto";
import { basename, dirname } from "path";

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
  private static listFieldMap: { [listId: string]: Map<string, FieldInfo> } = {};

  /**
   * Reset all static state
   */
  public static reset(): void {
    PagesHelper.pages = [];
    PagesHelper.processedPages = {};
    PagesHelper.listFieldMap = {};
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
    skipExistingPages: boolean = false
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

        const pageTemplate = (templates as PageTemplate[]).find(
          (t) => t.Title === template
        );
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
          console.log(
            `Template "${template}" not found on the site, will create a default page instead.`
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
    context: ControlShortcodeContext | null = null
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

    const canvas = CanvasHelper.compose(existing, controls, ownership);
    await CanvasHelper.save(webUrl, slug, canvas);

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

    if (result.title) {
      data.title = result.title;
    }

    return { id, data };
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
  public static async setPageMetadata(
    webUrl: string,
    slug: string,
    metadata: { [fieldName: string]: any } | null = null,
    author: any = undefined
  ) {
    const hasMetadata = !!metadata && Object.keys(metadata).length > 0;
    const hasAuthor = typeof author !== "undefined" && author !== null;

    if (!hasMetadata && !hasAuthor) {
      return;
    }

    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList) {
      const validatedMetadata = hasMetadata
        ? await this.getValidatedMetadata(webUrl, pageList, metadata as any)
        : {};

      if (hasAuthor) {
        // `Author` is SharePoint's own created-by column, which takes a claim
        // like any other person field — not the site user id the front matter
        // carries, so the id is resolved to its login name first.
        validatedMetadata["Author"] =
          `[{'Key':'${await this.resolveAuthorClaim(webUrl, author)}'}]`;
      }

      if (Object.keys(validatedMetadata).length === 0) {
        Logger.debug(
          `Skipping metadata update for ${slug} because none of the provided fields exist on Site Pages.`
        );
        return;
      }

      await executeWithRetry(
        "spo listitem set",
        {
          listId: pageList.Id,
          id: pageId,
          webUrl,
          ...validatedMetadata,
        },
        CliCommand.getRetry()
      );
    }
  }

  private static async getValidatedMetadata(
    webUrl: string,
    pageList: any,
    metadata: { [fieldName: string]: any }
  ): Promise<{ [fieldName: string]: any }> {
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

    const validated: { [fieldName: string]: any } = {};

    for (const [key, value] of Object.entries(metadata)) {
      const fieldInfo = fieldMap.get(key.toLowerCase());

      if (!fieldInfo?.internalName) {
        Logger.debug(
          `Skipping metadata field '${key}' because it does not exist on list '${listId}'.`
        );
        continue;
      }

      const transformed = await this.transformMetadataValue(
        webUrl,
        fieldInfo,
        value
      );

      if (typeof transformed === "undefined") {
        continue;
      }

      validated[fieldInfo.internalName] = transformed;
    }

    return validated;
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
      if (!term) {
        Logger.debug(
          `Skipping invalid taxonomy value for field '${fieldInfo.internalName}'.`
        );
        continue;
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
   * Turn the `author` front matter into the claim SharePoint's Author column
   * expects. The metadata editor writes the site user id it found in the site's
   * own user list, which is only meaningful to that site, so it is resolved back
   * to the user's login name here. A UPN is accepted too, for front matter
   * written by hand.
   */
  private static async resolveAuthorClaim(
    webUrl: string,
    author: any
  ): Promise<string> {
    const siteUserId =
      typeof author === "number"
        ? author
        : typeof author === "string" && /^\d+$/.test(author.trim())
          ? parseInt(author.trim(), 10)
          : null;

    if (siteUserId !== null) {
      const { stdout } = await executeWithRetry(
        "spo user get",
        {
          webUrl,
          id: siteUserId,
          output: "json",
        },
        CliCommand.getRetry()
      );

      const user = JSON.parse(stdout || "{}");
      const loginName = user?.LoginName || user?.loginName;

      if (!loginName) {
        throw new Error(
          `The 'author' site user id ${siteUserId} does not exist on ${webUrl}. A user only has an id on a site they are a member of, or have visited.`
        );
      }

      // The login name already is the claim
      return loginName;
    }

    if (typeof author === "string" && author.includes("@")) {
      return MetadataHelper.toClaimKey(author) as string;
    }

    throw new Error(
      `The 'author' front matter has to be a SharePoint site user id (a number) or a user principal name, but was '${author}'.`
    );
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
    if (pageId && pageList) {
      await executeWithRetry(
        "spo listitem set",
        {
          listId: pageList.Id,
          id: pageId,
          webUrl,
          Description: description,
          systemUpdate: true,
        },
        CliCommand.getRetry()
      );
    }
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
  private static getUntouchedPages(): string[] {
    let untouched: string[] = [];
    for (const page of PagesHelper.pages) {
      const { FileRef: url } = page;
      if (!url) {
        continue;
      }
      const slug = url.toLowerCase().split("/sitepages/")[1];
      if (!PagesHelper.processedPages[slug]) {
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
