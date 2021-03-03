import { TelemetryHelper } from './TelemetryHelper';
import * as fs from 'fs';
import * as fg from 'fast-glob';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { IconRenderer, CalloutRenderer } from '../shortcodes';
import { Shortcode } from '../models';
import { Logger } from './logger';

export class ShortcodesHelpers {
  private static shortcodes: Shortcode = {
    icon: IconRenderer,
    callout: CalloutRenderer
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
        if (sc && sc.name && sc.render) {
          ShortcodesHelpers.shortcodes[sc.name] = { render: sc.render };
        }
      }
    }

    TelemetryHelper.trackCustomShortcodes(files.length);
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

    Logger.debug(`Doctor uses ${tags.length} shortcodes for HTML parsing.`);
    TelemetryHelper.trackShortcodeUsage(tags.length);

    const $ = cheerio.load(htmlMarkup, { xmlMode: true });

    for (const tag of tags) {
      const elms = $(tag).toArray();
      // const elms = [...document.getElementsByTagName(tag) as any];
      Logger.debug(`Doctor found ${elms.length} element(s) for "${tag}" shortcode.`);
      if (elms && elms.length > 0) {
        const shortcode = ShortcodesHelpers.shortcodes[tag];

        for (const elm of elms) {
          if (elm && shortcode && shortcode.render) {
            Logger.debug(`Executing shortcode "${tag}"`);

            const $elm = $(elm);
            const attributes = this.getAllAttributes($elm.get(0));

            const scHtml = await shortcode.render(attributes, $elm.html());
            $elm.replaceWith(scHtml);

            Logger.debug(`Shortcode "${tag}" its HTML:`);
            Logger.debug(scHtml);
            Logger.debug(``);
          }
        }
      }
    }
    
    Logger.debug(`The HTML after shortcode convertion`);
    Logger.debug($.html());
    Logger.debug(``);

    return $.html();
  }
  
  /**
   * Get all attributes
   * @param $elm 
   */
  public static getAllAttributes($elm: any) {
    const allAttr = {};

    if ($elm.attribs) {
      const names = Object.keys($elm.attribs);

      for(const name of names) {
        allAttr[`${name}`] = $elm.attribs[name];
      }
    }
    return allAttr;
  };
  
  /**
   * Retrieve all registered shortcodes
   */
  public static get() {
    return ShortcodesHelpers.shortcodes;
  }
}