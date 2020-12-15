import * as path from 'path';
import * as fg from 'fast-glob';
import * as fs from 'fs';
import Listr = require('listr');
import parseMarkdown = require('frontmatter');
import showdown = require('showdown');
import kleur = require('kleur');
import { JSDOM } from 'jsdom';
import { FileHelpers } from '../helpers/FileHelpers';
import { execScript } from '../helpers/execScript';
import { Observable } from 'rxjs';
import { FolderHelpers } from '../helpers/FolderHelpers';
import { NavigationHelper } from '../helpers/NavigationHelper';
import { CommandArguments } from '../models/CommandArguments';
import { Authenticate } from './authenticate';
import { PublishOutput } from '../models/PublishOutput';
import { Logger } from '../helpers/logger';

export class Publish {

  /**
   * Publishes the markdown files to SharePoint
   * @param options 
   */
  public static async start(options: CommandArguments) {
    Logger.debug(`Running with the following options: ${JSON.stringify(options)}`);

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
      }
    ]).run().catch(err => {
      console.error(err);
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
    const files = await fg(`${startFolder}/**/*.md`);

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
    const { webUrl, webPartTitle } = options;
    const converter = new showdown.Converter();

    return new Observable(observer => {
      (async () => {
        try {
          const { files } = ctx;

          for (const file of files) {
            if (file.endsWith('.md')) {
              const filename = path.basename(file);
              observer.next(`Started processing: ${filename}`);

              let contents = fs.readFileSync(file, { encoding: "utf-8" });
              if (contents) {

                let markup = parseMarkdown(contents);
                const htmlMarkup = converter.makeHtml(contents);
                const htmlElm = new JSDOM(htmlMarkup);
                const imgElms = [...htmlElm.window.document.querySelectorAll('img') as any] as HTMLImageElement[];

                // Check if the required data for the article is present
                if (markup && markup.data) {
                  if (!markup.data.title) {
                    return Promise.reject(new Error(`The ${filename} has no 'title' defined`));
                  }
                  if (!markup.data.slug) {
                    return Promise.reject(new Error(`The ${filename} has no 'slug' defined`));
                  }
                }

                let { title, slug, draft } = markup.data;

                if (!slug) {
                  slug = `${title.replace(/ /g, '-')}.aspx`
                } else if (!(slug as string).endsWith('.aspx')) {
                  slug = `${slug}.aspx`
                }

                if (imgElms && imgElms.length > 0) {
                  observer.next(`Uploading images referenced in ${filename}`);

                  markup = await this.processImages(imgElms, filename, contents, options, output);
                }

                if (markup && markup.content) {
                  observer.next(`Creating or updating the page in SharePoint for ${filename}`);

                  // Check if the page already exists
                  await this.createPageIfNotExists(webUrl, slug, title);
      
                  // Retrieving all the controls from the page, so that we can start replacing the 
                  const controlData: string = await this.getPageControls(webUrl, slug);
                  
                  if (controlData) {
                    const webparts = JSON.parse(controlData);
                    const markdownWp = webparts.find((c: any) => c.title === webPartTitle);
                    const updatedMarkdown = markup.content.replace(/\n/g, '\\n').replace(/"/g, `\\"`);                    
                    await this.insertOrCreateControl(webPartTitle, updatedMarkdown, slug, webUrl, markdownWp ? markdownWp.id : null);
                  }

                  // Check if page needs to be published
                  if (typeof draft !== "undefined") {
                    if (!draft) {
                      observer.next(`Publishing ${filename}`);
                      await this.publishPageIfNeeded(webUrl, slug);
                    }
                  }

                  ++output.pagesProcessed;
                }

                // Check if the file contains a menu element to add too
                if (output.navigation && markup && markup.data && markup.data.menu) {
                  Logger.debug(`Adding item to the navigation: ${slug} - ${title} - ${JSON.stringify(markup.data.menu)} `);

                  output.navigation = NavigationHelper.hierarchy(webUrl, output.navigation, markup.data.menu, slug, title);
                }
              }
            }
          }
        } catch (e) {
          observer.error(e);
          return;
        }
        observer.complete();
      })();
    });
  }


  /**
   * Process images referenced in the file
   * @param imgElms 
   * @param filename 
   * @param contents 
   * @param options 
   * @param output 
   */
  private static async processImages(imgElms: HTMLImageElement[], filename: string, contents: string, options: CommandArguments, output: PublishOutput) {
    const { startFolder, assetLibrary, webUrl, overwriteImages } = options;

    for (const img of imgElms.filter(i => !i.src.startsWith(`http`))) {
      const imgDirectory = path.join(startFolder, path.dirname(filename), path.dirname(img.src));
      const imgPath = path.join(startFolder, path.dirname(filename), img.src);

      const folders = imgDirectory.replace(startFolder, '').split('/');
      let crntFolder = assetLibrary;

      // Start folder creation process
      crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);

      try {
        await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);

        contents = contents.replace(new RegExp(img.src, 'g'), `${webUrl}/${crntFolder}/${path.basename(img.src)}`);
        const markup = parseMarkdown(contents);
        ++output.imagesProcessed;

        return markup;
      } catch (e) {
        return Promise.reject(new Error(`Something failed while uploading the image asset. ${e.message}`));
      }
    }
  }

  /**
   * Check if the page exists, and if it doesn't it will be created
   * @param webUrl 
   * @param slug 
   * @param title 
   */
  private static async createPageIfNotExists(webUrl: string, slug: string, title: string): Promise<void> {
    try {
      await execScript(`localm365`, [`spo`, `page`, `get`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`]);
    } catch (e) {
      // Check if folders for the file need to be created
      if (slug.split('/').length > 1) {
        const folders = slug.split('/');
        await FolderHelpers.create('sitepages', folders.slice(0, folders.length - 1), webUrl);
      }
      // File doesn't exist
      await execScript(`localm365`, [`spo`, `page`, `add`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `--title`, `"${title}"`]);
    }
  }

  /**
   * Retrieve all the page controls
   * @param webUrl 
   * @param slug 
   */
  private static async getPageControls(webUrl: string, slug: string): Promise<string> {
    return await execScript(`localm365`, [`spo`, `page`, `control`, `list`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `-o`, `json`, `|`, `jq`]);
  }

  /**
   * Inserts or create the control
   * @param webPartTitle 
   * @param updatedMarkdown 
   */
  private static async insertOrCreateControl(webPartTitle: string, updatedMarkdown: string, slug: string, webUrl: string, wpId: string = null) {
    const wpData = `'{"title":"${webPartTitle}","serverProcessedContent": {"searchablePlainTexts": {"code": "${updatedMarkdown}"}},"dataVersion": "2.0","properties": {"displayPreview": true,"lineWrapping": true,"miniMap": {"enabled": false},"previewState": "Show","theme": "Monokai"}}'`;
    
    if (wpId) {
      // Web part needs to be updated
      await execScript(`localm365`, [`spo`, `page`, `control`, `set`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `--id`, `${wpId}`, `--webPartData`, wpData]);
    } else {
      // Add new markdown web part
      await execScript(`localm365`, [`spo`, `page`, `clientsidewebpart`, `add`, `--webUrl`, `"${webUrl}"`, `--pageName`, `"${slug}"`, `--webPartId`, `1ef5ed11-ce7b-44be-bc5e-4abd55101d16`, `--webPartData`, wpData]);
    }
  }

  /**
   * Publish the page
   * @param webUrl 
   * @param slug 
   */
  private static async publishPageIfNeeded(webUrl: string, slug: string) {
    const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);
    await execScript(`localm365`, [`spo`, `file`, `checkin`, `--webUrl`, `"${webUrl}"`, `--fileUrl`, relativeUrl]);
    await execScript(`localm365`, [`spo`, `page`, `set`, `--name`, `"${slug}"`, `--webUrl`, `"${webUrl}"`, `--publish`]);
  }
}