import { Observable } from "rxjs";
import {
  Page,
  PageTemplate,
  File,
  MarkdownSettings,
  CommandArguments,
} from "@models";
import {
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  ListHelpers,
  Logger,
  MarkdownHelper,
} from "@helpers";
import { executeCommand } from "@pnp/cli-microsoft365";
import { basename, dirname } from "path";

interface FieldInfo {
  internalName: string;
  typeAsString: string;
  termSetId?: string;
}

export class PagesHelper {
  private static readonly PERSON_CLAIM_PREFIX = "i:0#.f|membership|";
  private static pages: File[] = [];
  private static processedPages: { [slug: string]: number } = {};
  private static listFieldMap: { [listId: string]: Map<string, FieldInfo> } = {};
  private static termGuidMap: Map<string, string> = new Map<string, string>();

  private static readonly SIMPLE_FIELD_TYPES = new Set<string>([
    "Text",
    "Note",
    "Number",
    "Currency",
    "Boolean",
    "Choice",
  ]);

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
   */
  public static async clean(
    webUrl: string,
    options: CommandArguments
  ): Promise<Observable<string>> {
    return new Observable((observer) => {
      (async () => {
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
              observer.next(`Cleaning up page: ${slug}`);
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
            observer.error(e);
            Logger.debug(e.message);

            if (!options.continueOnError) {
              throw e.message;
            }
          }
        }
        observer.complete();
      })();
    });
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
              page.FileRef.toLowerCase() === relativeUrl.toLowerCase()
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
   * Retrieve all the page controls
   * @param webUrl
   * @param slug
   */
  public static async getPageControls(
    webUrl: string,
    slug: string
  ): Promise<string> {
    Logger.debug(`Get page controls for ${slug}`);

    const { stdout } = await executeWithRetry(
      "spo page get",
      {
        webUrl,
        name: slug,
        output: "json",
      },
      CliCommand.getRetry()
    );
    const output = JSON.parse(stdout || "{}");

    Logger.debug(JSON.stringify(output.canvasContentJson || "[]"));
    return output.canvasContentJson || "[]";
  }

  /**
   * Inserts or create the control
   * @param webPartTitle
   * @param markdown
   */
  public static async insertOrCreateControl(
    webPartTitle: string,
    markdown: string,
    slug: string,
    webUrl: string,
    options: CommandArguments,
    wpId: string = null,
    mdOptions: MarkdownSettings | null,
    wasAlreadyParsed: boolean = false
  ) {
    Logger.debug(
      `Insert the markdown webpart for the page ${slug} - Control ID: ${wpId} - Was already parsed: ${wasAlreadyParsed}`
    );

    const wpData = await MarkdownHelper.getJsonData(
      webPartTitle,
      markdown,
      mdOptions,
      options,
      wasAlreadyParsed
    );

    if (wpId) {
      // Web part needs to be updated
      await executeWithRetry(
        "spo page control set",
        {
          webUrl,
          pageName: slug,
          id: wpId,
          webPartData: `@${wpData}`,
        },
        CliCommand.getRetry()
      );
    } else {
      // Add new markdown web part
      const addOptions = {
        webUrl,
        pageName: slug,
        webPartId: "1ef5ed11-ce7b-44be-bc5e-4abd55101d16",
        webPartData: `@${wpData}`,
        section: 1,
        column: 1,
      };

      try {
        await executeWithRetry(
          "spo page clientsidewebpart add",
          addOptions,
          CliCommand.getRetry()
        );
      } catch (e: any) {
        if (!this.isInvalidPlacementError(e)) {
          throw e;
        }

        Logger.debug(
          `Page ${slug} has no compatible section yet. Creating a OneColumn section and retrying web part add.`
        );

        await executeWithRetry(
          "spo page section add",
          {
            webUrl,
            pageName: slug,
            sectionTemplate: "OneColumn",
          },
          CliCommand.getRetry()
        );

        await executeWithRetry(
          "spo page clientsidewebpart add",
          addOptions,
          CliCommand.getRetry()
        );
      }
    }
  }

  private static isInvalidPlacementError(error: any): boolean {
    const message =
      typeof error === "string"
        ? error
        : error?.message || JSON.stringify(error);
    const normalized = (message || "").toLowerCase();

    return (
      normalized.includes("invalid section") ||
      normalized.includes("invalid column")
    );
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
    metadata: { [fieldName: string]: any } = null
  ) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList && metadata && Object.keys(metadata).length > 0) {
      const validatedMetadata = await this.getValidatedMetadata(
        webUrl,
        pageList,
        metadata
      );

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
        const fieldInfo: FieldInfo = {
          internalName: field.InternalName || field.StaticName || field.Title,
          typeAsString: field.TypeAsString || "",
          termSetId: field.TermSetId,
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

    if (!typeAsString || this.SIMPLE_FIELD_TYPES.has(typeAsString)) {
      return value;
    }

    switch (typeAsString) {
      case "TaxonomyFieldType":
        return await this.transformTaxonomySingle(webUrl, fieldInfo, value);
      case "TaxonomyFieldTypeMulti":
        return await this.transformTaxonomyMulti(webUrl, fieldInfo, value);
      case "User":
        return this.transformUserSingle(value);
      case "UserMulti":
        return this.transformUserMulti(value);
      case "DateTime":
        return this.transformDateTime(value);
      case "Lookup":
        return this.transformLookupSingle(fieldInfo, value);
      case "LookupMulti":
        return this.transformLookupMulti(fieldInfo, value);
      case "URL":
        return this.transformUrl(value);
      case "MultiChoice":
        return this.transformMultiChoice(value);
      default:
        return value;
    }
  }

  private static async transformTaxonomySingle(
    webUrl: string,
    fieldInfo: FieldInfo,
    value: any
  ): Promise<string | undefined> {
    const term = this.normalizeTaxonomyTerm(value);
    if (!term) {
      Logger.debug(
        `Skipping taxonomy field '${fieldInfo.internalName}' because the value is invalid.`
      );
      return undefined;
    }

    const termGuid =
      term.termGuid ||
      (await this.resolveTermGuid(webUrl, fieldInfo, term.label || ""));
    if (!termGuid) {
      return undefined;
    }

    return `${term.label}|${termGuid}`;
  }

  private static async transformTaxonomyMulti(
    webUrl: string,
    fieldInfo: FieldInfo,
    value: any
  ): Promise<string | undefined> {
    const values = Array.isArray(value) ? value : [value];
    const terms: string[] = [];

    for (const entry of values) {
      const term = this.normalizeTaxonomyTerm(entry);
      if (!term) {
        Logger.debug(
          `Skipping invalid taxonomy value for field '${fieldInfo.internalName}'.`
        );
        continue;
      }

      const termGuid =
        term.termGuid ||
        (await this.resolveTermGuid(webUrl, fieldInfo, term.label || ""));
      if (!termGuid) {
        continue;
      }

      terms.push(`${term.label}|${termGuid}`);
    }

    return terms.length > 0 ? terms.join(";") : undefined;
  }

  private static normalizeTaxonomyTerm(
    value: any
  ): { label: string; termGuid?: string } | null {
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

  private static async resolveTermGuid(
    webUrl: string,
    fieldInfo: FieldInfo,
    label: string
  ): Promise<string | undefined> {
    const termSetId = fieldInfo.termSetId;
    if (!termSetId) {
      Logger.debug(
        `Skipping taxonomy field '${fieldInfo.internalName}' because TermSetId is missing.`
      );
      return undefined;
    }

    const cacheKey = `${termSetId}:${label.toLowerCase()}`;
    if (this.termGuidMap.has(cacheKey)) {
      return this.termGuidMap.get(cacheKey);
    }

    try {
      const { stdout } = await executeWithRetry(
        "spo term get",
        {
          webUrl,
          termSetId,
          name: label,
          output: "json",
        },
        CliCommand.getRetry()
      );
      const term = JSON.parse(stdout || "{}");
      const termGuid = term?.id || term?.Id;
      if (!termGuid) {
        Logger.debug(
          `Could not resolve taxonomy term '${label}' for field '${fieldInfo.internalName}'.`
        );
        return undefined;
      }

      this.termGuidMap.set(cacheKey, termGuid);
      return termGuid;
    } catch (error: any) {
      Logger.debug(
        `Could not resolve taxonomy term '${label}' for field '${fieldInfo.internalName}': ${error?.message || error}`
      );
      return undefined;
    }
  }

  private static transformUserSingle(value: any): string | undefined {
    if (typeof value !== "string" || !value.trim()) {
      Logger.debug(`Skipping User field because value '${value}' is invalid.`);
      return undefined;
    }

    const upn = value.trim().toLowerCase();
    return `[{'Key':'${this.PERSON_CLAIM_PREFIX}${upn}'}]`;
  }

  private static transformUserMulti(value: any): string | undefined {
    const values = Array.isArray(value) ? value : [value];
    const claims: string[] = [];

    for (const entry of values) {
      if (typeof entry !== "string" || !entry.trim()) {
        Logger.debug(`Skipping invalid UserMulti value '${entry}'.`);
        continue;
      }

      const upn = entry.trim().toLowerCase();
      claims.push(`{'Key':'${this.PERSON_CLAIM_PREFIX}${upn}'}`);
    }

    return claims.length > 0 ? `[${claims.join(",")}]` : undefined;
  }

  private static transformDateTime(value: any): any {
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
      return `${parsed.getFullYear()}-${this.pad2(parsed.getMonth() + 1)}-${this.pad2(parsed.getDate())} ${this.pad2(parsed.getHours())}:${this.pad2(parsed.getMinutes())}:${this.pad2(parsed.getSeconds())}`;
    }

    Logger.debug(
      `DateTime value '${value}' is ambiguous or invalid. Passing through without conversion.`
    );
    return value;
  }

  private static transformLookupSingle(
    fieldInfo: FieldInfo,
    value: any
  ): number | undefined {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return parseInt(value.trim(), 10);
    }

    Logger.debug(
      `Skipping lookup field '${fieldInfo.internalName}' because value '${value}' is not a numeric item ID.`
    );
    return undefined;
  }

  private static transformLookupMulti(
    fieldInfo: FieldInfo,
    value: any
  ): string | undefined {
    const values = Array.isArray(value) ? value : [value];
    const ids: number[] = [];

    for (const entry of values) {
      const transformed = this.transformLookupSingle(fieldInfo, entry);
      if (typeof transformed === "number") {
        ids.push(transformed);
      }
    }

    return ids.length > 0 ? ids.join(";#") : undefined;
  }

  private static transformUrl(value: any): string | undefined {
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

  private static transformMultiChoice(value: any): any {
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
      const slug = url.toLowerCase().split("/sitepages/")[1];
      if (!PagesHelper.processedPages[slug]) {
        untouched.push(slug);
      }
    }
    return untouched;
  }

}
