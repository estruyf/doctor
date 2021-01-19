import { CommandArguments } from '../models/CommandArguments';
import { HeaderOptions } from './../models/HeaderOptions';
import { ArgumentsHelper } from './ArgumentsHelper';
import { execScript } from './execScript';
import * as path from 'path';
import { FolderHelpers } from './FolderHelpers';
import { FileHelpers } from './FileHelpers';


export class HeaderHelper {

  /**
   * Set the page header based on the settings in the page's front matter
   * @param filePath 
   * @param webUrl 
   * @param slug 
   * @param header 
   * @param options 
   */
  public static async set(filePath: string, webUrl: string, slug: string, header: HeaderOptions, options: CommandArguments) {
    const { assetLibrary, startFolder, overwriteImages } = options;

    let setPageHeader = `spo page header set --webUrl "${webUrl}" --pageName "${slug}"`;
    
    if (header) {
      if (header.type) {
        setPageHeader = `${setPageHeader} --type "${header.type}"`;
      }

      if (header.image) {
        const imgDirectory = path.join(path.dirname(filePath), path.dirname(header.image));
        const imgPath = path.join(path.dirname(filePath), header.image);

        const uniStartPath = startFolder.replace(/\\/g, '/');
        const folders = imgDirectory.replace(/\\/g, '/').replace(uniStartPath, '').split('/');
        let crntFolder = assetLibrary;

        // Start folder creation process
        crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);
        await FileHelpers.create(crntFolder, imgPath, webUrl, overwriteImages);

        const imgUrl = FileHelpers.getRelUrl(webUrl, `${crntFolder}/${path.basename(header.image)}`);
        setPageHeader = `${setPageHeader} --imageUrl "${imgUrl}"`;

        if (header.altText) {
          setPageHeader = `${setPageHeader} --altText "${header.altText}"`;
        }

        if (typeof header.translateX !== "undefined") {
          setPageHeader = `${setPageHeader} --translateX "${header.translateX}"`;
        }
        
        if (typeof header.translateY !== "undefined") {
          setPageHeader = `${setPageHeader} --translateY "${header.translateY}"`;
        }
      }
      
      if (header.layout) {
        setPageHeader = `${setPageHeader} --layout "${header.layout}"`;
      }

      if (header.textAlignment) {
        setPageHeader = `${setPageHeader} --textAlignment "${header.textAlignment}"`;
      }
      
      if (header.showTopicHeader) {
        setPageHeader = `${setPageHeader} --showTopicHeader`;
      }
      
      if (header.topicHeader) {
        setPageHeader = `${setPageHeader} --topicHeader "${header.topicHeader}"`;
      }
      
      if (header.showPublishDate) {
        setPageHeader = `${setPageHeader} --showPublishDate`;
      }
      
      if (header.authors) {
        setPageHeader = `${setPageHeader} --authors "${header.authors.join(",")}"`;
      }
    }
    
    await execScript(`localm365`, ArgumentsHelper.parse(`${setPageHeader}`));
  }
}