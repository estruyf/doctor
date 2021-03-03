import * as fs from 'fs';
import * as path from 'path';
import { ShortcodeRender } from 'src/models';
import { Logger } from "../helpers";

export const IconRenderer: ShortcodeRender = {
  render: async function (attrs: { name: string }, markup: string): Promise<string> {

    if (!attrs || !attrs.name) {
      return "";
    }

    const iconName = `${attrs.name.toLowerCase().replace('ic_fluent_', '')}.svg`;
    const iconPath = path.join(__dirname, `../../node_modules/@fluentui/svg-icons/icons/${iconName}`);
    Logger.debug(`Fetching icon: ${iconPath}`);
    try {
      if (fs.existsSync(iconPath)) {
        const icon = fs.readFileSync(iconPath, { encoding: "utf-8" });
        Logger.debug(icon);
        return `
          <i data-icon-name="${attrs.name}" role="presentation" aria-hidden="true">
            ${icon}
          </i>
        `;
      } else {
        Logger.debug(`Icon SVG "${iconPath}" doesn't exist.`);
      }
    } catch (e) {
      // The SVG didn't exist
      Logger.debug(`Icon SVG "${iconPath}" failed to be retrieved.`);
    }

    return "";
  },
  beforeMarkdown: false
};