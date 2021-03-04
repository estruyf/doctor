import { Observable } from "rxjs";
import { Page, PageTemplate, File, MarkdownSettings, CommandArguments } from "src/models";
import { ArgumentsHelper, CliCommand, execScript, FileHelpers, FolderHelpers, ListHelpers, Logger, MarkdownHelper } from ".";


export class PagesHelper {
  private static pages: File[] = [];
  private static processedPages: { [slug: string]: number } = {};

  /**
   * Retrieve all the pages from the current site
   * @param webUrl 
   */
  public static async getAllPages(webUrl: string): Promise<void> {
    this.pages = await FileHelpers.getAllPages(webUrl, 'sitepages');
    Logger.debug(`Existing pages`);
    Logger.debug(this.pages);
  }

  /**
   * Cleaning up all the untouched pages
   * @param webUrl 
   */
  public static async clean(webUrl: string, options: CommandArguments): Promise<Observable<string>> {
    return new Observable(observer => {
      (async () => {
        try {
          const untouched = this.getUntouchedPages();
          for (const slug in untouched) {
            if (slug && !slug.toLowerCase().startsWith('templates') && slug.endsWith('.aspx')) {
              observer.next(`Cleaning up page: ${slug}`);
              const filePath = `${webUrl}${webUrl.endsWith('/') ? '' : '/'}sitepages/${slug}}`;
              const relUrl = FileHelpers.getRelUrl(webUrl, filePath);
              await execScript<string>(ArgumentsHelper.parse(`spo file remove --webUrl "${webUrl}" --url "${relUrl}" --confirm`));
            }
          }
        } catch (e) {
          observer.error(e);
          Logger.debug(e.message);

          if (!options.continueOnError) {
            throw e.message;
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
  public static async createPageIfNotExists(webUrl: string, slug: string, title: string, layout: string = "Article", comments: boolean = false, description: string = "", template: string | null = null, skipExistingPages: boolean = false): Promise<boolean> {
    try {
      const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);

      if (skipExistingPages) {
        if (this.pages && this.pages.length > 0) {
          const page = this.pages.find((page: File) => page.FileRef.toLowerCase() === relativeUrl.toLowerCase());
          if (page) {
            // Page already existed
            this.processedPages[slug] = page.ID;
            return true;
          }
        }
      }
      
      let pageData = await execScript(ArgumentsHelper.parse(`spo page get --webUrl "${webUrl}" --name "${slug}" --metadataOnly --output json`), false);
      if (pageData && typeof pageData === "string") {
        pageData = JSON.parse(pageData);
      }

      Logger.debug(pageData);

      let cmdArgs = ``;

      if (pageData && (pageData as Page).title !== title) {
        cmdArgs = `--title "${title}"`;
      }

      if (pageData && description) {
        cmdArgs = `${cmdArgs} --description "${description}"`;
      }

      if (pageData && (pageData as Page).layoutType !== layout) {
        cmdArgs = `${cmdArgs} --layoutType "${layout}"`;
      }

      if (pageData && (pageData as Page).commentsDisabled !== !comments) {
        cmdArgs = `${cmdArgs} --commentsEnabled ${comments ? "true" : "false" }`;
      }

      if (cmdArgs) {
        await execScript(ArgumentsHelper.parse(`spo page set --webUrl "${webUrl}" --name "${slug}" ${cmdArgs}`), CliCommand.getRetry());
      }

      return true;
    } catch (e) {
      // Check if folders for the file need to be created
      if (slug.split('/').length > 1) {
        const folders = slug.split('/');
        await FolderHelpers.create('sitepages', folders.slice(0, folders.length - 1), webUrl);
      }

      if (template) {
        let templates: PageTemplate[] | string = await execScript(ArgumentsHelper.parse(`spo page template list --webUrl "${webUrl}" --output json`), CliCommand.getRetry());
        if (templates && typeof templates === "string") {
          templates = JSON.parse(templates);
        }
        
        Logger.debug(templates);

        const pageTemplate = (templates as PageTemplate[]).find(t => t.Title === template);
        if (pageTemplate) {
          const templateUrl = pageTemplate.Url.toLowerCase().replace("sitepages/", "");
          await execScript(ArgumentsHelper.parse(`spo page copy --webUrl "${webUrl}" --sourceName "${templateUrl}" --targetUrl "${slug}"`), CliCommand.getRetry());
          await execScript(ArgumentsHelper.parse(`spo page set --webUrl "${webUrl}" --name "${slug}" --publish`), CliCommand.getRetry());
          return await this.createPageIfNotExists(webUrl, slug, title, layout, comments, description, null, skipExistingPages);
        } else {
          console.log(`Template "${template}" not found on the site, will create a default page instead.`)
        }
      }

      // File doesn't exist
      await execScript(ArgumentsHelper.parse(`spo page add --webUrl "${webUrl}" --name "${slug}" --title "${title}" --layoutType "${layout}" ${comments ? "--commentsEnabled" : ""} --description "${description}"`), CliCommand.getRetry());

      return false;
    }
  }

  /**
   * Retrieve all the page controls
   * @param webUrl 
   * @param slug 
   */
  public static async getPageControls(webUrl: string, slug: string): Promise<string> {
    Logger.debug(`Get page controls for ${slug}`);

    let output = await execScript<any | string>(ArgumentsHelper.parse(`spo page get --webUrl "${webUrl}" --name "${slug}" --output json`));
    if (output && typeof output === "string") {
      output = JSON.parse(output);
    }
    
    Logger.debug(JSON.stringify(output.canvasContentJson || "[]"));
    return output.canvasContentJson || "[]";
  }


  /**
   * Inserts or create the control
   * @param webPartTitle 
   * @param markdown 
   */
  public static async insertOrCreateControl(webPartTitle: string, markdown: string, slug: string, webUrl: string, wpId: string = null, mdOptions: MarkdownSettings | null) {
    Logger.debug(`Insert the markdown webpart for the page ${slug} - Control ID: ${wpId}`);

    const wpData = await MarkdownHelper.getJsonData(webPartTitle, markdown, mdOptions);
    
    if (wpId) {
      // Web part needs to be updated
      await execScript(ArgumentsHelper.parse(`spo page control set --webUrl "${webUrl}" --name "${slug}" --id "${wpId}" --webPartData @${wpData}`), CliCommand.getRetry());
    } else {
      // Add new markdown web part
      await execScript(ArgumentsHelper.parse(`spo page clientsidewebpart add --webUrl "${webUrl}" --pageName "${slug}" --webPartId 1ef5ed11-ce7b-44be-bc5e-4abd55101d16 --webPartData @${wpData}`), CliCommand.getRetry());
    }
  }


  /**
   * Set the page its metadata
   * @param webUrl 
   * @param slug
   * @param metadata 
   */
  public static async setPageMetadata(webUrl: string, slug: string, metadata: { [fieldName: string]: any } = null) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList) {
      let metadataCommand: string = `spo listitem set --listTitle "${pageList.Title}" --id ${pageId} --webUrl "${webUrl}"`;

      if (metadata) {
        for (const fieldName in metadata) {
          metadataCommand = `${metadataCommand} --${fieldName} "${metadata[fieldName]}"`
        }
      }

      await execScript(ArgumentsHelper.parse(metadataCommand), CliCommand.getRetry());
    }
  }


  /**
   * Set the page its description
   * @param webUrl 
   * @param slug 
   * @param description 
   */
  public static async setPageDescription(webUrl: string, slug: string, description: string) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList) {
      await execScript(ArgumentsHelper.parse(`spo listitem set --listTitle "${pageList.Title}" --id ${pageId} --webUrl "${webUrl}" --Description "${description}" --systemUpdate`), CliCommand.getRetry());
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
      await execScript(ArgumentsHelper.parse(`spo file checkin --webUrl "${webUrl}" --fileUrl "${relativeUrl}"`), false);
    } catch (e) {
      // Might be that the file doesn't need to be checked in
    }
    await execScript(ArgumentsHelper.parse(`spo page set --name "${slug}" --webUrl "${webUrl}" --publish`), CliCommand.getRetry());
  }

  /**
   * Retrieve the page id
   * @param webUrl 
   * @param slug 
   */
  private static async getPageId(webUrl: string, slug: string) {
    if (!this.processedPages[slug]) {
      let pageData: any = await execScript(ArgumentsHelper.parse(`spo page get --webUrl "${webUrl}" --name "${slug}" --metadataOnly --output json`), CliCommand.getRetry());
      if (pageData && typeof pageData === "string") {
        pageData = JSON.parse(pageData);

        Logger.debug(pageData);

        if (pageData.ListItemAllFields && pageData.ListItemAllFields.Id) {
          this.processedPages[slug] = pageData.ListItemAllFields.Id;
          return this.processedPages[slug];
        }

        return null;
      }
    }

    return this.processedPages[slug];
  }

  /**
   * Receive all the pages which have not been touched
   */
  private static getUntouchedPages(): string[] {
    let untouched: string[] = [];
    for (const page of this.pages) {
      const { FileRef: url } = page;
      const slug = url.toLowerCase().split('/sitepages/')[1];
      if (!this.processedPages[slug]) {
        untouched.push(slug);
      }
    }
    return untouched;
  }
}