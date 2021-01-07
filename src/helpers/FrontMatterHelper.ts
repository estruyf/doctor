import { PageFrontMatter } from "../models/PageFrontMatter";


export class FrontMatterHelper {

  /**
   * Retrieve the Slug for the page
   * @param data 
   */
  public static getSlug(data: PageFrontMatter, startFolder: string, filePath: string): string {
    let { slug, title } = data;

    const uniStartPath = startFolder.replace(/\\/g, '/');
    const pathSlug = filePath.replace(/\\/g, '/').replace(uniStartPath, '').split('/');
    pathSlug.pop();
    const spFilePath = pathSlug.filter(s => s).join('/');

    if (!slug) {
      slug = `${spFilePath ? `${spFilePath}/` : ''}${title.replace(/ /g, '-').toLowerCase()}.aspx`
    } else if (!(slug as string).endsWith('.aspx')) {
      slug = `${slug}.aspx`
    }
    return slug;
  }
}