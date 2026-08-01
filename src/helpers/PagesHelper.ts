import {
  Page,
  PageTemplate,
  File,
  MarkdownSettings,
  CommandArguments,
  TaskOutput,
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

export class PagesHelper {
  private static pages: File[] = [];
  private static processedPages: { [slug: string]: number } = {};
  private static listFieldMap: { [listId: string]: Map<string, string> } = {};

  public static reset() {
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
    wpId: string | null | undefined = null,
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
    metadata: { [fieldName: string]: any } | null = null
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
      fieldMap = new Map<string, string>();

      for (const field of fields) {
        if (field?.InternalName) {
          fieldMap.set(field.InternalName.toLowerCase(), field.InternalName);
        }

        if (field?.StaticName) {
          fieldMap.set(field.StaticName.toLowerCase(), field.InternalName || field.StaticName);
        }

        if (field?.Title) {
          fieldMap.set(field.Title.toLowerCase(), field.InternalName || field.Title);
        }
      }

      this.listFieldMap[listId] = fieldMap;
    }

    const validated: { [fieldName: string]: any } = {};

    for (const [key, value] of Object.entries(metadata)) {
      const internalName = fieldMap.get(key.toLowerCase());

      if (!internalName) {
        Logger.debug(
          `Skipping metadata field '${key}' because it does not exist on list '${listId}'.`
        );
        continue;
      }

      validated[internalName] = value;
    }

    return validated;
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
      if (!url) continue;
      const slug = url.toLowerCase().split("/sitepages/")[1];
      if (!PagesHelper.processedPages[slug]) {
        untouched.push(slug);
      }
    }
    return untouched;
  }

}
