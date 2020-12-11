import { FileHelpers } from './helpers/FileHelpers';
import * as kleur from 'kleur';
import * as fs from 'fs';
import * as path from 'path';
import * as fg from 'fast-glob';
import { CommandArguments } from './models/CommandArguments';
import Listr = require('listr');
import parseMarkdown = require('frontmatter');
import showdown = require('showdown');
import { JSDOM } from 'jsdom';
import { execScript } from './helpers/execScript';
import { Observable } from 'rxjs';
import { FolderHelpers } from './helpers/FolderHelpers';
import { Menu } from './models/Menu';
import { NavigationHelper } from './helpers/NavigationHelper';

export class Commands {

  /**
   * Starts the command processing
   * @param options 
   */
  public static async start(options: CommandArguments) {

    if (options) {
      const hrstart = process.hrtime();

      console.log('');
      console.log(kleur.bold().bgMagenta().white(` START: `), `${options.task} job`);
      console.log('');

      if (!fs.existsSync(options.startFolder)) {
        return Promise.reject(new Error(`The provided folder location doesn't exist.`));
      }

      if (options.task === "build") {
        console.log(kleur.green('Starting build'));
      } else if (options.task === "publish") {
        await this.publish(options);
      }


      console.log('');
      const hrend = process.hrtime(hrstart);
      console.info(kleur.bold().bgMagenta().white(` EXECUTION TIME: `), `${hrend[0]}sec.`);
      console.log(kleur.bold().bgMagenta().white(` COMPLETED: `), `${options.task} job`);
      console.log('');
    }
  }

  /**
   * Publishes the markdown files to SharePoint
   * @param options 
   */
  public static async publish(options: CommandArguments) {
    if (!options.webUrl) {
      return Promise.reject(new Error(`In order to run the publish command, you need to specify the '--url' property.`));
    }

    const { assetLibrary, auth, startFolder, webUrl, username, password, webPartTitle, overwriteImages } = options;
    const converter = new showdown.Converter();

    let pagesProcessed = 0;
    let imagesProcessed = 0;
    let navigation: Menu = options.menu ? { ...options.menu } : null;

    // Authentication task - Splitted for output log of the device code
    await new Listr([
      {
        title: `Authenticate to M365 with ${auth}`,
        task: async () => {
          if (auth === "deviceCode") {
            await execScript(`m365`, [`login`], true);
          } else {
            await execScript(`m365`, [`login`, `--authType password`, `--userName '${username}'`, `--password '${password}'`]);
          }
        }
      }
    ]).run();

    await new Listr([
      {
        title: `Fetch all markdown files`,
        task: async (ctx: any) => {
          const files = await fg(`${startFolder}/**/*.md`);

          if (files && files.length > 0) {
            ctx.files = files;
          } else {
            return Promise.reject(new Error(`No markdown files found in the folder.`));
          }
        }
      },
      {
        title: `Process markdown files`,
        task: async (ctx: any) => {
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
                      const imgElms = [...htmlElm.window.document.querySelectorAll('img') as any];

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

                      if (imgElms && imgElms.length > 0) {
                        observer.next(`Uploading images referenced in ${filename}`);

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
                            markup = parseMarkdown(contents);
                            ++imagesProcessed;
                          } catch (e) {
                            return Promise.reject(new Error(`Something failed while uploading the image asset. ${e.message}`));
                          }
                        }
                      }

                      if (markup && markup.content) {
                        observer.next(`Creating or updating the page in SharePoint for ${filename}`);

                        // Check if the page exists, and if it doesn't it will be created
                        try {
                          await execScript(`m365`, [`spo`, `page`, `get`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`]);
                        } catch (e) {
                          // Check if folders for the file need to be created
                          if (slug.split('/').length > 1) {
                            const folders = slug.split('/');
                            await FolderHelpers.create('sitepages', folders.slice(0, folders.length - 1), webUrl);
                          }
                          // File doesn't exist
                          await execScript(`m365`, [`spo`, `page`, `add`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `--title`, `"${title}"`]);
                        }
            
                        const controlData: string = await execScript(`m365`, [`spo`, `page`, `control`, `list`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `-o`, `json`, `|`, `jq`]);
                        
                        if (controlData) {
                          const webparts = JSON.parse(controlData);
                          const markdownWp = webparts.find((c: any) => c.title === webPartTitle);
                          const updatedMarkdown = markup.content.replace(/\n/g, '\\n').replace(/"/g, `\\"`);
                          
                          const wpData = `'{"title":"${webPartTitle}","serverProcessedContent": {"searchablePlainTexts": {"code": "${updatedMarkdown}"}},"dataVersion": "2.0","properties": {"displayPreview": true,"lineWrapping": true,"miniMap": {"enabled": false},"previewState": "Show","theme": "Monokai"}}'`;
                          
                          if (markdownWp) {
                            // Web part needs to be updated
                            await execScript(`m365`, [`spo`, `page`, `control`, `set`, `--webUrl`, `"${webUrl}"`, `--name`, `"${slug}"`, `--id`, `${markdownWp.id}`, `--webPartData`, wpData]);
                          } else {
                            // Add new markdown web part
                            await execScript(`m365`, [`spo`, `page`, `clientsidewebpart`, `add`, `--webUrl`, `"${webUrl}"`, `--pageName`, `"${slug}"`, `--webPartId`, `1ef5ed11-ce7b-44be-bc5e-4abd55101d16`, `--webPartData`, wpData]);
                          }
                        }

                        // Check if page needs to be published
                        if (typeof draft !== "undefined") {
                          if (!draft) {
                            observer.next(`Publishing ${filename}`);
                            const relativeUrl = FileHelpers.getRelUrl(webUrl, `sitepages/${slug}`);
                            await execScript(`m365`, [`spo`, `file`, `checkin`, `--webUrl`, `"${webUrl}"`, `--fileUrl`, relativeUrl]);
                            await execScript(`m365`, [`spo`, `page`, `set`, `--name`, `"${slug}"`, `--webUrl`, `"${webUrl}"`, `--publish`]);
                          }
                        }

                        ++pagesProcessed;
                      }

                      // Check if the file contains a menu element to add too
                      if (navigation && markup && markup.data && markup.data.menu) {
                        navigation = NavigationHelper.hierarchy(webUrl, navigation, markup.data.menu, slug, title);
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
      },
      {
        title: `Updating navigation`,
        task: async (ctx: any) => {
          await NavigationHelper.update(webUrl, navigation);
        }
      }
    ]).run();


    // (async () => {
    //   try {
    //     const files = await fg(`${startFolder}/**/*.md`);

    //     for (const file of files) {
    //       if (file.endsWith('.md')) {
    //         const filename = path.basename(file);

    //         let contents = fs.readFileSync(file, { encoding: "utf-8" });
    //         if (contents) {

    //           let markup = parseMarkdown(contents);
    //           const htmlMarkup = converter.makeHtml(contents);
    //           const htmlElm = new JSDOM(htmlMarkup);
    //           const imgElms = [...htmlElm.window.document.querySelectorAll('img') as any];

    //           // Check if the required data for the article is present
    //           if (markup && markup.data) {
    //             if (!markup.data.title) {
    //               return Promise.reject(new Error(`The ${filename} has no 'title' defined`));
    //             }
    //             if (!markup.data.slug) {
    //               return Promise.reject(new Error(`The ${filename} has no 'slug' defined`));
    //             }
    //           }

    //           let { title, slug, draft } = markup.data;

    //           // Check if the file contains a menu element to add too
    //           if (navigation && markup && markup.data && markup.data.menu) {
    //             navigation = NavigationHelper.hierarchy(webUrl, navigation, markup.data.menu, slug, title);
    //           }
    //         }
    //       }
    //     }
    //   } catch (e) {
    //     return;
    //   }

    //   await NavigationHelper.update(webUrl, navigation);
    // })();

    console.log('');
    console.info(kleur.bold().bgYellow().black(` Publishing stats `));
    console.info(kleur.white(` Pages: ${pagesProcessed}`));
    console.info(kleur.white(` Images: ${imagesProcessed}`));
  }
}