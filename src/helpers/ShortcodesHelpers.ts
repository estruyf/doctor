import * as fs from 'fs';
import * as fg from 'fast-glob';
import * as path from 'path';
import { Window } from 'happy-dom';
import { IconRenderer } from '../shortcodes';
import { Shortcode } from '../models';
import { Logger } from './logger';

export class ShortcodesHelpers {
  private static shortcodes: Shortcode = {
    icon: IconRenderer
  };

  /**
   * Initialize the shortcodes
   * @param shortcodes 
   */
  public static async init(shortcodes: string = "./shortcodes") {
    let files: string[] = [];
    if (fs.existsSync(shortcodes)) {
      files = await fg((`${shortcodes}/**/*.js`).replace(/\\/g, '/'));
    }

    Logger.debug(`Doctor found ${files.length} custom shortcodes`);

    // Load all the custom shortcodes
    if (files && files.length > 0) {
      for (const file of files) {
        const sc = await require(path.join(process.cwd(), file));
        console.log(sc)
        if (sc && sc.name && sc.render) {
          ShortcodesHelpers.shortcodes[sc.name] = { render: sc.render };
        }
      }
    }
  }

  /**
   * Parse the HTML with known shortcodes
   * @param htmlMarkup 
   */
  public static async parse(htmlMarkup: string): Promise<string> {
    if (!ShortcodesHelpers.shortcodes) return htmlMarkup;

    const tags = Object.getOwnPropertyNames(ShortcodesHelpers.get());
    if (!tags || tags.length < 1) return htmlMarkup;

    for (const tag of tags) {
      if (typeof ShortcodesHelpers.shortcodes[tag].render !== 'function') {
        throw new Error(`Missing render function for shortcode tag: "${tag}"`);
      }
    }

    Logger.debug(`Doctor uses ${tags.length} shortcodes for HTML parsing.`)

    const window = new Window();
    const document = window.document;
    document.body.innerHTML = htmlMarkup;

    for (const tag of tags) {
      const elms = document.querySelectorAll(tag);
      if (elms && elms.length) {
        const shortcode = ShortcodesHelpers.shortcodes[tag];
        for (const elm of elms) {
          if (elm && shortcode && shortcode.render) {
            Logger.debug(`Executing shortcode "${tag}"`);

            const scHtml = await shortcode.render(elm.hasAttributes() ? this.processAttributes((elm.attributes as any)) : {}, elm.innerHTML);
            elm.parentElement.innerHTML = scHtml;

            Logger.debug(`Shortcode "${tag}" its HTML:`);
            Logger.debug(scHtml);
            Logger.debug(``);
          }
        }
      }
    }

    return htmlMarkup;
  }
  
  /**
   * Retrieve all registered shortcodes
   */
  public static get() {
    return ShortcodesHelpers.shortcodes;
  }

  /**
   * Process all attributes to an object
   * @param attributes 
   */
  private static processAttributes(attributes: Element["attributes"]) {
    const allAttr = {};
    for(let i = 0; i <= attributes.length; i++) {
      const attr = attributes[i];
      if (attr && attr.name && attr.value) {
        const name = attr.name.toString();
        const value = attr.value;
        allAttr[`${name}`] = value;
      }
    }
    return allAttr;
  }
}