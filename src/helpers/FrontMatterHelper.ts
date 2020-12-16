import { PageFrontMatter } from "../models/PageFrontMatter";


export class FrontMatterHelper {

  /**
   * Retrieve the Slug for the page
   * @param data 
   */
  public static getSlug(data: PageFrontMatter): string {
    let { slug, title } = data;
    if (!slug) {
      slug = `${title.replace(/ /g, '-')}.aspx`
    } else if (!(slug as string).endsWith('.aspx')) {
      slug = `${slug}.aspx`
    }
    return slug;
  }
}