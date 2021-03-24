import { MultilingualHelper } from './MultilingualHelper';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import * as matter from "gray-matter";
import md = require('markdown-it');
import { CommandArguments, PublishOutput, Control, PageFrontMatter } from '../models';
import { FileHelpers, FolderHelpers, FrontMatterHelper, HeaderHelper, Logger, NavigationHelper, PagesHelper, StatusHelper } from '.';
import { Observable, Subscriber } from 'rxjs';

export class DoctorTranspiler {
  private static converter = new md({ html: true, breaks: true });

  /**
   * Process the retrieved Markdown files
   * @param ctx 
   */
  public static async processMDFiles(ctx: any, options: CommandArguments, output: PublishOutput): Promise<Observable<string>> {
    const { webUrl } = options;

    return new Observable(observer => {
      (async () => {
        const { files } = ctx;
        
        await PagesHelper.getAllPages(webUrl);

        for (const file of files) {
          try {
            await this.processFile(file, observer, options, output);
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
   * Process page
   * @param file 
   * @param observer 
   * @param converter 
   * @param options 
   * @param output 
   * @param languagePage 
   */
  public static async processFile(file: string, observer: Subscriber<string>, options: CommandArguments, output: PublishOutput, languagePageSlug: string = null) {
    const { webUrl, webPartTitle, skipExistingPages, disableComments } = options;

    if (file.endsWith('.md')) {
      const filename = path.basename(file);
      observer.next(`Started processing: ${filename}`);

      let contents = fs.readFileSync(file, { encoding: "utf-8" });
      if (contents) {

        const markup: matter.GrayMatterFile<string> = matter(contents);

        // Don't process language files, these will be processed later in the process
        if (!languagePageSlug && markup.data && markup.data.type === "translation") {
          return;
        }

        const htmlMarkup = file.endsWith(`.machinetranslated.md`) ? contents : this.converter.render(contents);

        const $ = cheerio.load(htmlMarkup, { xmlMode: true, decodeEntities: false });
        const imgElms = $(`img`).toArray();
        const anchorElms = $(`a`).toArray();

        // Check if the required data for the article is present
        if (markup && !markup.data) {
          throw new Error(`The "${filename}" has no front matter defined`);
        } else if (markup && markup.data) {
          if (!markup.data.title) {
            throw new Error(`The "${filename}" has no 'title' defined`);
          }
        }

        let { title, description, draft, layout, header, template, metadata } = markup.data as PageFrontMatter;
        let slug = languagePageSlug || FrontMatterHelper.getSlug(markup.data as PageFrontMatter, options.startFolder, file);

        // Check if comments are disabled on global level, or overwrite it from page level
        const disablePageComments = typeof markup.data.comments !== "undefined" ? !markup.data.comments : disableComments;
        Logger.debug(`Page comments ${disablePageComments ? 'disabled' : 'enabled'}`);

        // Image processing
        if (imgElms && imgElms.length > 0) {
          observer.next(`Uploading images referenced in ${filename}`);

          markup.content = await this.processImages($, imgElms, file, markup.content, options, output);
        }

        // Anchor processing
        if (anchorElms && anchorElms.length > 0) {
          observer.next(`Processing links in ${filename}`);

          Logger.debug(`Number of links in ${filename}: ${anchorElms.length}`)

          try {
            markup.content = this.processLinks($, anchorElms, file, markup.content, options);
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
          const existed = await PagesHelper.createPageIfNotExists(webUrl, slug, title, layout, disablePageComments, description, template || options.pageTemplate, (skipExistingPages && !languagePageSlug));

          Logger.debug(`Page existed: ${existed} - Skipping existing pages: ${skipExistingPages}`);

          if (!existed || (existed && !skipExistingPages) || (existed && languagePageSlug)) {
            // Check if the header of the page needs to be changed
            await HeaderHelper.set(file, webUrl, slug, header, options, !!(template || options.pageTemplate));

            // Retrieving all the controls from the page, so that we can start replacing the 
            const controlData: string = await PagesHelper.getPageControls(webUrl, slug);
            if (controlData) {
              const webparts: Control[] = JSON.parse(controlData);
              const markdownWp: Control = webparts.find((c: Control) => c.webPartData && c.webPartData.title === webPartTitle);
              await PagesHelper.insertOrCreateControl(webPartTitle, markup.content, slug, webUrl, markdownWp ? markdownWp.id : null, options.markdown, file.endsWith(`.machinetranslated.md`));
            }

            // Check if metadata needs to be added to the page
            if (metadata) {
              await PagesHelper.setPageMetadata(webUrl, slug, metadata);
            }
            
            // Check if page needs to be published
            if (typeof draft === "undefined" || !draft) {
              observer.next(`Publishing ${filename}`);
              await PagesHelper.publishPageIfNeeded(webUrl, slug);
            }

            // Set the page its description
            if (description) {
              observer.next(`Setting page description for ${filename}`);
              await PagesHelper.setPageDescription(webUrl, slug, description);
            }

            StatusHelper.addPage();
          } else {
            Logger.debug(`Skipping "${filename}" as it already exists`);
          }
        }

        // Check if the file contains a menu element to add too and if not in draft status (cannot add draft pages to navigation)
        if (output.navigation && markup && markup.data && markup.data.menu && !markup.data.draft) {
          Logger.debug(`Adding item to the navigation: ${slug} - ${title} - ${JSON.stringify(markup.data.menu)} `);

          output.navigation = NavigationHelper.hierarchy(webUrl, output.navigation, markup.data.menu, slug, title);
        }

        // Verify if there are linked multilingual pages
        if (!languagePageSlug && options.multilingual && options.multilingual.enableTranslations && markup && markup.data && markup.data.localization) {
          await MultilingualHelper.linkPage(markup.data.localization, file, slug, options, observer, output);
        }
      }
    }
  }

  /**
   * Process images referenced in the file
   * @param $ 
   * @param imgElms 
   * @param filePath 
   * @param contents 
   * @param options 
   * @param output 
   */
  private static async processImages($: cheerio.Root, imgElms: cheerio.Element[], filePath: string, contents: string, options: CommandArguments, output: PublishOutput) {
    const { startFolder, assetLibrary, webUrl, overwriteImages } = options;
    
    const imgSources = imgElms.filter(i => !$(i).attr("src").startsWith(`http`)).map(img => $(img).attr('src'));
    const uImgSources = [...new Set(imgSources)];

    for (const imgSource of uImgSources) {
      Logger.debug(`Adding image: ${imgSource} - ${imgSources.length}`)

      const imgDirectory = path.join(path.dirname(filePath), path.dirname(imgSource));
      const imgPath = path.join(path.dirname(filePath), imgSource);

      const uniStartPath = startFolder.replace(/\\/g, '/');
      const folders = imgDirectory.replace(/\\/g, '/').replace(uniStartPath, '').split('/');
      let crntFolder = assetLibrary;

      // Start folder creation process
      crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);

      try {
        const imgUrl = await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);
        contents = contents.replace(new RegExp(imgSource, 'g'), imgUrl);
        StatusHelper.addImage();
      } catch (e) {
        return Promise.reject(new Error(`Something failed while uploading the image asset. ${e.message}`));
      }
    }

    return contents;
  }

  /**
   * Process the links referenced in the markdown files
   * @param $ 
   * @param linkElms 
   * @param filePath 
   * @param content 
   * @param options 
   */
  private static processLinks($: cheerio.Root, linkElms: cheerio.Element[], filePath: string, content: string, options: CommandArguments) {
    const { webUrl, startFolder } = options;

    const fLinks = linkElms.filter(i => !$(i).attr("href").startsWith(`http`));
    const uLinks = [...new Set(fLinks)];

    for (const link of uLinks) {
      const $link = $(link);
      const fileLink = $link.attr('href');
      let mdFile = "";

      Logger.debug(`Processing link: ${fileLink} for ${filePath}`);

      if (fileLink.endsWith(`.md`)) {
        mdFile = $link.attr('href');
      } else if (fileLink === ".") {
        mdFile = path.basename(filePath);
      } else {
        mdFile = `${$link.attr('href')}.md`;
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
        const mdData = matter(mdContents);
        if (!mdData || !mdData.data) {
          return;
        }

        const slug = FrontMatterHelper.getSlug(mdData.data as PageFrontMatter, startFolder, mdFilePath);
        const spUrl = `${webUrl}${webUrl.endsWith('/') ? '' : '/'}sitepages/${slug}`;
        Logger.debug(`Referenced file slug: ${spUrl}`);

        // Update the link in the markdown
        content = content.replace(`(${fileLink})`, `(${spUrl})`);
        content = content.replace(`"${fileLink}"`, `"${spUrl}"`);
        content = content.replace(`'${fileLink}`, `'${spUrl}'`);
      } else {
        Logger.debug(`Referenced file not found`);
      }
    }

    return content;
  }
}