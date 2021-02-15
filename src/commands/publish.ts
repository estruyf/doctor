import * as path from 'path';
import * as fg from 'fast-glob';
import * as fs from 'fs';
import Listr = require('listr');
import parseMarkdown = require('frontmatter');
import kleur = require('kleur');
import md = require('markdown-it');
import { Window } from 'happy-dom';
import { ArgumentsHelper, execScript, FileHelpers, FolderHelpers, FrontMatterHelper, HeaderHelper, ListHelpers, Logger, MarkdownHelper, NavigationHelper, SiteHelpers } from '../helpers';
import { Observable } from 'rxjs';
import { Authenticate } from './authenticate';
import { CommandArguments, Page, PublishOutput, File, PageTemplate, MarkdownSettings } from '../models';

export class Publish {
  private static pages: File[] = [];
  private static processedPages: { [slug: string]: number } = {};

  /**
   * Publishes the markdown files to SharePoint
   * @param options 
   */
  public static async start(options: CommandArguments) {
    Logger.debug(`Running with the following options: ${Logger.mask(JSON.stringify(options), [options.password, options.certificateBase64Encoded])}`);

    if (!fs.existsSync(options.startFolder)) {
      return Promise.reject(new Error(`The provided folder location doesn't exist.`));
    }

    if (!options.webUrl) {
      return Promise.reject(new Error(`In order to run the publish command, you need to specify the '--url' property.`));
    }

    const { startFolder, webUrl } = options;

    let ouput: PublishOutput = {
      pagesProcessed: 0,
      imagesProcessed: 0,
      navigation: options.menu ? { ...options.menu } : null
    };

    // Initializes the authentication
    await Authenticate.init(options);

    await new Listr([
      {
        title: `Clean up all the files`,
        task: async () => {
          await FileHelpers.cleanUp(options, 'sitepages');
          await FileHelpers.cleanUp(options, options.assetLibrary)
        },
        enabled: () => options.cleanStart && options.confirm
      },
      {
        title: `Fetch all markdown files`,
        task: async (ctx: any) => await this.fetchMDFiles(ctx, startFolder)
      },
      {
        title: `Process markdown files`,
        task: async (ctx: any) => await this.processMDFiles(ctx, options, ouput)
      },
      {
        title: `Updating navigation`,
        task: async () => await NavigationHelper.update(webUrl, ouput.navigation)
      },
      {
        title: `Change the look of the site`,
        task: async (ctx: any) => await SiteHelpers.changeLook(ctx, options),
        enabled: () => !!options.siteDesign
      }
    ]).run().catch(err => {
      throw err;
    });

    console.log('');
    console.info(kleur.bold().bgYellow().black(` Publishing stats `));
    console.info(kleur.white(` Pages: ${ouput.pagesProcessed}`));
    console.info(kleur.white(` Images: ${ouput.imagesProcessed}`));
  }

  /**
   * Fetched the Markdown files from the start folder
   * @param ctx 
   * @param startFolder 
   */
  private static async fetchMDFiles(ctx: any, startFolder: string) {
    const files = await fg((`${startFolder}/**/*.md`).replace(/\\/g, '/'));

    if (files && files.length > 0) {
      ctx.files = files;
    } else {
      return Promise.reject(new Error(`No markdown files found in the folder.`));
    }
  }

  /**
   * Process the retrieved Markdown files
   * @param ctx 
   */
  private static async processMDFiles(ctx: any, options: CommandArguments, output: PublishOutput): Promise<Observable<string>> {
    const { webUrl, webPartTitle, skipExistingPages } = options;
    const converter = new md({ html: true, breaks: true });

    return new Observable(observer => {
      (async () => {
        const { files } = ctx;
        this.pages = await FileHelpers.getAllPages(webUrl, 'sitepages');
        Logger.debug(`Existing pages`);
        Logger.debug(this.pages);

        for (const file of files) {
          try {

            if (file.endsWith('.md')) {
              const filename = path.basename(file);
              observer.next(`Started processing: ${filename}`);

              let contents = fs.readFileSync(file, { encoding: "utf-8" });
              if (contents) {

                let markup = parseMarkdown(contents);
                const htmlMarkup = converter.render(contents);
                const window = new Window();
                const document = window.document;
                document.body.innerHTML = htmlMarkup;
                const imgElms = [...document.querySelectorAll('img') as any] as HTMLImageElement[];
                const anchorElms = [...document.querySelectorAll('a') as any] as HTMLAnchorElement[];

                // Check if the required data for the article is present
                if (markup && !markup.data) {
                  throw new Error(`The "${filename}" has no front matter defined`);
                } else if (markup && markup.data) {
                  if (!markup.data.title) {
                    throw new Error(`The "${filename}" has no 'title' defined`);
                  }
                }

                let { title, description, draft, comments, layout, header, template, metadata } = markup.data;
                let slug = FrontMatterHelper.getSlug(markup.data, options.startFolder, file);

                // Image processing
                if (imgElms && imgElms.length > 0) {
                  observer.next(`Uploading images referenced in ${filename}`);

                  markup = await this.processImages(imgElms, file, contents, options, output);
                }

                // Anchor processing
                if (anchorElms && anchorElms.length > 0) {
                  observer.next(`Processing links in ${filename}`);

                  Logger.debug(`Number of links in ${filename}: ${anchorElms.length}`)

                  try {
                    markup.content = this.processLinks(anchorElms, file, markup.content, options);
                  } catch (e) {
                    throw e.message;
                  }
                }

                // Checks if output needs to be generated
                if (options.outputFolder) {
                  const { outputFolder, startFolder } = options;
                  const processedFilePath = file.replace(startFolder, path.join(process.cwd(), outputFolder));
                  const dirPath = path.dirname(processedFilePath);
                  fs.mkdirSync(dirPath, { recursive: true });
                  fs.writeFileSync(processedFilePath, markup.content, { encoding: "utf-8" });
                }

                if (markup && markup.content) {
                  observer.next(`Creating or updating the page in SharePoint for ${filename}`);

                  // Check if the page already exists
                  const existed = await this.createPageIfNotExists(webUrl, slug, title, layout, comments, description, template, skipExistingPages);

                  if (!existed || (existed && !skipExistingPages)) {
                    // Check if the header of the page needs to be changed
                    await HeaderHelper.set(file, webUrl, slug, header, options, !!template);
        
                    // Retrieving all the controls from the page, so that we can start replacing the 
                    const controlData: string = await this.getPageControls(webUrl, slug);
                    
                    if (controlData) {
                      const webparts = JSON.parse(controlData);
                      const markdownWp = webparts.find((c: any) => c.title === webPartTitle);   
                      await this.insertOrCreateControl(webPartTitle, markup.content, slug, webUrl, markdownWp ? markdownWp.id : null, options.markdown);
                    }

                    // Check if metadata needs to be added to the page
                    if (metadata) {
                      await this.setPageMetadata(webUrl, slug, metadata);
                    }
                    
                    // Check if page needs to be published
                    if (typeof draft === "undefined" || !draft) {
                      observer.next(`Publishing ${filename}`);
                      await this.publishPageIfNeeded(webUrl, slug);
                    }

                    // Set the page its description
                    if (description) {
                      observer.next(`Setting page description for ${filename}`);
                      await this.setPageDescription(webUrl, slug, description);
                    }

                    ++output.pagesProcessed;
                  } else {
                    Logger.debug(`Skipping "${filename}" as it already exists`);
                  }
                }

                // Check if the file contains a menu element to add too
                if (output.navigation && markup && markup.data && markup.data.menu) {
                  Logger.debug(`Adding item to the navigation: ${slug} - ${title} - ${JSON.stringify(markup.data.menu)} `);

                  output.navigation = NavigationHelper.hierarchy(webUrl, output.navigation, markup.data.menu, slug, title);
                }
              }
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
   * Process images referenced in the file
   * @param imgElms 
   * @param filePath 
   * @param contents 
   * @param options 
   * @param output 
   */
  private static async processImages(imgElms: HTMLImageElement[], filePath: string, contents: string, options: CommandArguments, output: PublishOutput) {
    const { startFolder, assetLibrary, webUrl, overwriteImages } = options;
    
    const imgs = imgElms.filter(i => !i.src.startsWith(`http`));
    for (const img of imgs) {
      Logger.debug(`Adding image: ${img.src} - ${imgs.length}`)

      const imgDirectory = path.join(path.dirname(filePath), path.dirname(img.src));
      const imgPath = path.join(path.dirname(filePath), img.src);

      const uniStartPath = startFolder.replace(/\\/g, '/');
      const folders = imgDirectory.replace(/\\/g, '/').replace(uniStartPath, '').split('/');
      let crntFolder = assetLibrary;

      // Start folder creation process
      crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);

      try {
        await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);
        contents = contents.replace(new RegExp(img.src, 'g'), (`${webUrl}/${crntFolder}/${path.basename(img.src)}`).replace(/ /g, "%20"));
        ++output.imagesProcessed;
      } catch (e) {
        return Promise.reject(new Error(`Something failed while uploading the image asset. ${e.message}`));
      }
    }

    const markup = parseMarkdown(contents);
    return markup;
  }

  /**
   * Process the links referenced in the markdown files
   * @param linkElms 
   * @param filePath 
   * @param content 
   * @param options 
   */
  private static processLinks(linkElms: HTMLAnchorElement[], filePath: string, content: string, options: CommandArguments) {
    const { webUrl, startFolder } = options;

    for (const link of linkElms.filter(i => !i.getAttribute('href').startsWith(`http`))) {

      const fileLink = link.getAttribute('href');
      let mdFile = "";

      Logger.debug(`Processing link: ${fileLink} for ${filePath}`);

      if (fileLink.endsWith(`.md`)) {
        mdFile = link.getAttribute('href');
      } else if (fileLink === ".") {
        mdFile = path.basename(filePath);
      } else {
        mdFile = `${link.getAttribute('href')}.md`;
      }

      const mdFilePath = path.join(path.dirname(filePath), mdFile);

      Logger.debug(`File path for link: ${mdFilePath}`);

      if (fs.existsSync(mdFilePath)) {
        // Get the contents of the file
        const mdContents = fs.readFileSync(mdFilePath, { encoding: 'utf-8' });
        if (!mdContents) {
          return;
        } 

        // Get the slug
        const mdData = parseMarkdown(mdContents);
        if (!mdData || !mdData.data) {
          return;
        }

        const slug = FrontMatterHelper.getSlug(mdData.data, startFolder, mdFilePath);
        const spUrl = `${webUrl}${webUrl.endsWith('/') ? '' : '/'}sitepages/${slug}`;
        Logger.debug(`Referenced file slug: ${spUrl}`);

        // Update the link in the markdown
        content = content.replace(`(${fileLink})`, `(${spUrl})`);
      } else {
        Logger.debug(`Referenced file not found`);
      }
    }

    return content;
  }

  /**
   * Check if the page exists, and if it doesn't it will be created
   * @param webUrl 
   * @param slug 
   * @param title 
   */
  private static async createPageIfNotExists(webUrl: string, slug: string, title: string, layout: string = "Article", comments: boolean = false, description: string = "", template: string | null = null, skipExistingPages: boolean = false): Promise<boolean> {
    try {
      const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);

      if (skipExistingPages) {
        if (this.pages && this.pages.length > 0) {
          const page = this.pages.find((page: File) => page.FileRef.toLowerCase() === relativeUrl.toLowerCase());
          if (page) {
            // Page already existed
            return true;
          }
        }
      }
      
      let pageData = await execScript(ArgumentsHelper.parse(`spo page get --webUrl "${webUrl}" --name "${slug}" --output json`));
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
        await execScript(ArgumentsHelper.parse(`spo page set --webUrl "${webUrl}" --name "${slug}" ${cmdArgs}`));
      }

      return true;
    } catch (e) {
      // Check if folders for the file need to be created
      if (slug.split('/').length > 1) {
        const folders = slug.split('/');
        await FolderHelpers.create('sitepages', folders.slice(0, folders.length - 1), webUrl);
      }

      if (template) {
        let templates: PageTemplate[] | string = await execScript(ArgumentsHelper.parse(`spo page template list --webUrl "${webUrl}" --output json`));
        if (templates && typeof templates === "string") {
          templates = JSON.parse(templates);
        }
        
        Logger.debug(templates);

        const pageTemplate = (templates as PageTemplate[]).find(t => t.Title === template);
        if (pageTemplate) {
          const templateUrl = pageTemplate.Url.toLowerCase().replace("sitepages/", "");
          await execScript(ArgumentsHelper.parse(`spo page copy --webUrl "${webUrl}" --sourceName "${templateUrl}" --targetUrl "${slug}"`));
          await execScript(ArgumentsHelper.parse(`spo page set --webUrl "${webUrl}" --name "${slug}" --publish`));
          return this.createPageIfNotExists(webUrl, slug, title, layout, comments, description, null, skipExistingPages);
        } else {
          console.log(`Template "${template}" not found on the site, will create a default page instead.`)
        }
      }

      // File doesn't exist
      await execScript(ArgumentsHelper.parse(`spo page add --webUrl "${webUrl}" --name "${slug}" --title "${title}" --layoutType "${layout}" ${comments ? "--commentsEnabled" : ""} --description "${description}"`));

      return false;
    }
  }

  /**
   * Retrieve all the page controls
   * @param webUrl 
   * @param slug 
   */
  private static async getPageControls(webUrl: string, slug: string): Promise<string> {
    const output = await execScript<string>(ArgumentsHelper.parse(`spo page control list --webUrl "${webUrl}" --name "${slug}" -o json`));
    return output;
  }

  /**
   * Inserts or create the control
   * @param webPartTitle 
   * @param markdown 
   */
  private static async insertOrCreateControl(webPartTitle: string, markdown: string, slug: string, webUrl: string, wpId: string = null, mdOptions: MarkdownSettings | null) {
    const wpData = await MarkdownHelper.getJsonData(webPartTitle, markdown, mdOptions);
    
    if (wpId) {
      // Web part needs to be updated
      await execScript([...ArgumentsHelper.parse(`spo page control set --webUrl "${webUrl}" --name "${slug}" --id "${wpId}" --webPartData`), wpData]);
    } else {
      // Add new markdown web part
      await execScript([...ArgumentsHelper.parse(`spo page clientsidewebpart add --webUrl "${webUrl}" --pageName "${slug}" --webPartId 1ef5ed11-ce7b-44be-bc5e-4abd55101d16 --webPartData`), wpData]);
    }
  }

  /**
   * Set the page its metadata
   * @param webUrl 
   * @param slug
   * @param metadata 
   */
  private static async setPageMetadata(webUrl: string, slug: string, metadata: { [fieldName: string]: any } = null) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList) {
      let metadataCommand: string = `spo listitem set --listTitle "${pageList.Title}" --id ${pageId} --webUrl "${webUrl}"`;

      if (metadata) {
        for (const fieldName in metadata) {
          metadataCommand = `${metadataCommand} --${fieldName} "${metadata[fieldName]}"`
        }
      }

      await execScript(ArgumentsHelper.parse(metadataCommand));
    }
  }

  /**
   * Set the page its description
   * @param webUrl 
   * @param slug 
   * @param description 
   */
  private static async setPageDescription(webUrl: string, slug: string, description: string) {
    const pageId = await this.getPageId(webUrl, slug);
    const pageList = await ListHelpers.getSitePagesList(webUrl);
    if (pageId && pageList) {
      await execScript(ArgumentsHelper.parse(`spo listitem set --listTitle "${pageList.Title}" --id ${pageId} --webUrl "${webUrl}" --Description "${description}" --systemUpdate`));
    }
  }

  /**
   * Publish the page
   * @param webUrl 
   * @param slug 
   */
  private static async publishPageIfNeeded(webUrl: string, slug: string) {
    const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);
    try {
      await execScript(ArgumentsHelper.parse(`spo file checkin --webUrl "${webUrl}" --fileUrl "${relativeUrl}"`));
    } catch (e) {
      // Might be that the file doesn't need to be checked in
    }
    await execScript(ArgumentsHelper.parse(`spo page set --name "${slug}" --webUrl "${webUrl}" --publish`));
  }

  /**
   * Retrieve the page id
   * @param webUrl 
   * @param slug 
   */
  private static async getPageId(webUrl: string, slug: string) {
    if (!this.processedPages[slug]) {
      let pageData: any = await execScript(ArgumentsHelper.parse(`spo page get --webUrl "${webUrl}" --name "${slug}" --output json`));
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
}
