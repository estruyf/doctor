import * as fs from 'fs';
import * as fg from 'fast-glob';
import * as path from 'path';
import { Window } from 'happy-dom';
import { IconRenderer } from '../shortcodes';

export class ShortcodesHelpers {
  private static shortcodes = {
    icon: IconRenderer
  };

  public static async parse(htmlMarkup: string): Promise<string> {
    if (!ShortcodesHelpers.shortcodes) return htmlMarkup;

    const tags = Object.getOwnPropertyNames(ShortcodesHelpers.shortcodes);
    if (!tags || tags.length < 1) return htmlMarkup;

    for (const tag of tags) {
      if (typeof ShortcodesHelpers.shortcodes[tag].render !== 'function') {
        throw new Error(`Missing render function for shortcode tag: "${tag}"`);
      }
    }

    const window = new Window();
    const document = window.document;
    document.body.innerHTML = htmlMarkup;

    for (const tag of tags) {
      const elms = document.querySelectorAll(tag);
      if (elms && elms.length) {
        for (const elm of elms) {
          if (elm.innerHTML) {}
          // console.log(`InnerHTML`, tag, elm.innerHTML);
        }
      }
    }

    return htmlMarkup;
  }

  /**
   * Initialize the shortcodes
   * @param shortcodes 
   */
  public static async init(shortcodes: string = "./shortcodes") {
    let files: string[] = [];
    if (fs.existsSync(shortcodes)) {
      files = await fg((`${shortcodes}/**/*.js`).replace(/\\/g, '/'));
    }

    // Load all the custom shortcodes
    if (files && files.length > 0) {
      for (const file of files) {
        const sc = await require(path.join(process.cwd(), file));
        if (sc && sc.name && sc.render) {
          ShortcodesHelpers.shortcodes[sc.name] = { render: sc.render };
        }
      }
    }
  }
  
  /**
   * Retrieve all registered shortcodes
   */
  public static async get() {
    return ShortcodesHelpers.shortcodes;
  }
}