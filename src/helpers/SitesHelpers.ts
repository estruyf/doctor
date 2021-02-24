import * as path from 'path';
import { FileHelpers, FolderHelpers } from '.';
import { CommandArguments } from "../models/CommandArguments";
import { ArgumentsHelper } from "./ArgumentsHelper";
import { execScript } from "./execScript";
import { Logger } from "./logger";


export class SiteHelpers {

  /**
   * Change the look of the site
   * @param ctx 
   * @param options 
   */
  public static async changeLook(ctx: any, options: CommandArguments) {
    const { siteDesign, webUrl, assetLibrary, overwriteImages } = options;
    if (!siteDesign || Object.keys(siteDesign).length === 0) {
      return;
    }

    Logger.debug(`Start changing the look of the site with the following options:`);
    Logger.debug(JSON.stringify(siteDesign, null, 2));

    if (siteDesign.theme) {
      try {
        // Try to enable a custom theme
        await execScript(ArgumentsHelper.parse(`spo theme apply --webUrl "${webUrl}" --name "${siteDesign.theme}"`));
      } catch (e) {
        Logger.debug(`It seems that the "${siteDesign.theme}" is not a custom theme. Doctor will try to enable it as a known SharePoint theme.`)
        // Try to enable a known SharePoint theme
        await execScript(ArgumentsHelper.parse(`spo theme apply --webUrl "${webUrl}" --name "${siteDesign.theme}" --sharePointTheme`));
      }
    }

    if (siteDesign.chrome) {
      let cmdChrome = `spo site chrome set --url "${webUrl}"`;

      if (siteDesign.chrome.disableFooter) {
        cmdChrome = `${cmdChrome} --disableFooter`;
      }

      if (siteDesign.chrome.disableMegaMenu) {
        cmdChrome = `${cmdChrome} --disableMegaMenu`;
      }

      if (siteDesign.chrome.hideTitleInHeader) {
        cmdChrome = `${cmdChrome} --hideTitleInHeader`;
      }

      if (siteDesign.chrome.footerEmphasis) {
        cmdChrome = `${cmdChrome} --footerEmphasis "${siteDesign.chrome.footerEmphasis}`;
      }

      if (siteDesign.chrome.footerLayout) {
        cmdChrome = `${cmdChrome} --footerLayout "${siteDesign.chrome.footerLayout}"`;
      }

      if (siteDesign.chrome.headerEmphasis) {
        cmdChrome = `${cmdChrome} --headerEmphasis "${siteDesign.chrome.headerEmphasis}"`;
      }

      if (siteDesign.chrome.headerLayout) {
        cmdChrome = `${cmdChrome} --headerLayout "${siteDesign.chrome.headerLayout}"`;
      }

      if (siteDesign.chrome.logoAlignment) {
        cmdChrome = `${cmdChrome} --logoAlignment "${siteDesign.chrome.logoAlignment}"`;
      }

      await execScript(ArgumentsHelper.parse(cmdChrome));
    }
    
    if (typeof siteDesign.logo !== "undefined") {
      try {
        let imgUrl = siteDesign.logo;

        if (imgUrl) {
          const imgPath = path.join(process.cwd(), siteDesign.logo);

          Logger.debug(`Setting site logo with the following path: "${imgPath}"`);
          
          let crntFolder = `${assetLibrary}`;
          crntFolder = await FolderHelpers.create(crntFolder, ["site"], webUrl);
          
          await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);

          imgUrl = (`${webUrl}/${crntFolder}/${path.basename(path.basename(imgPath))}`).replace(/ /g, "%20");
        }
        
        await execScript(ArgumentsHelper.parse(`spo site set --url "${webUrl}" --siteLogoUrl "${imgUrl}"`));
      } catch (e) {
        return Promise.reject(new Error(`Something failed while setting the site logo. ${e.message}`));
      }
    }
  }
}