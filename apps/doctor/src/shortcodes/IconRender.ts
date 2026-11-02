import { join } from "path";
import { createRequire } from "module";
import { ShortcodeRender } from "@models";
import { Logger } from "@helpers";
import { existsAsync, readFileAsync } from "@utils";

const require = createRequire(import.meta.url);

function resolveFluentIconPath(iconName: string): string {
  try {
    const pkgRoot = join(
      require.resolve("@fluentui/svg-icons/package.json"),
      "..",
    );
    return join(pkgRoot, "icons", iconName);
  } catch {
    // Fallback for environments where the package isn't resolvable
    return join("node_modules", "@fluentui", "svg-icons", "icons", iconName);
  }
}

export const IconRenderer: ShortcodeRender = {
  render: async function (
    attrs: { name: string },
    markup: string
  ): Promise<string> {
    if (!attrs || !attrs.name) {
      return "";
    }

    const iconName = `${attrs.name
      .toLowerCase()
      .replace("ic_fluent_", "")}.svg`;
    const iconPath = resolveFluentIconPath(iconName);
    Logger.debug(`Fetching icon: ${iconPath}`);
    try {
      if (await existsAsync(iconPath)) {
        const icon = await readFileAsync(iconPath, { encoding: "utf-8" });
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
  beforeMarkdown: false,
};
