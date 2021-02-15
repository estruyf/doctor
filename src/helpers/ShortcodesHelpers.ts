import * as fs from 'fs';
import * as fg from 'fast-glob';
import * as path from 'path';
import { initializeIcons } from '@uifabric/icons';
import { getIcon, getIconClassName } from '@uifabric/styling';

initializeIcons(undefined, { warnOnMissingIcons: true, disableWarnings: false });

export class ShortcodesHelpers {
  private static shortcodes = {
    icon: {
      render: function (attrs: any, env) {
        if (!attrs || !attrs.name) {
          return "";
        }
        
        const icon = getIcon(attrs.name);
        
        if (icon && icon.code && icon.subset) {
          const className = getIconClassName(attrs.name);
          const cssStyles = `<style>
            .${className} {
              display: inline-block;
              font-family: ${icon.subset.fontFace.fontFamily};
              font-style: ${icon.subset.fontFace.fontStyle || 'normal'};
              font-weight: ${icon.subset.fontFace.fontWeight || 'normal'};
              speak: none;
            }
            .${className}:before{content:"${icon.code}"}
          </style>
          <i data-icon-name="${attrs.name}" role="presentation" aria-hidden="true" class="ms-Icon doctor-Icon ${className}" style="">${icon.code}</i>`;
          return cssStyles;
        }

        return "";
      }
    }
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