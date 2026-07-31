import { join } from "path";
import { CommandArguments, TaskOutput } from "@models";
import {
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  Logger,
} from "@helpers";

const getErrorMessage = (error: any): string => {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || JSON.stringify(error);
};

const isAuthOrPermissionError = (message: string): boolean => {
  const normalized = (message || "").toLowerCase();

  return (
    normalized.includes("status code 401") ||
    normalized.includes("status code 403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("access denied") ||
    normalized.includes("not authorized") ||
    normalized.includes("insufficient")
  );
};

export class SiteHelpers {
  /**
   * Change the look of the site
   * @param task
   * @param options
   */
  public static async changeLook(task: TaskOutput, options: CommandArguments) {
    const { siteDesign, webUrl, assetLibrary, overwriteImages, applyTheme } =
      options;
    if (!siteDesign || Object.keys(siteDesign).length === 0) {
      return;
    }

    Logger.debug(
      `Start changing the look of the site with the following options:`
    );
    Logger.debug(JSON.stringify(siteDesign, null, 2));

    if (siteDesign.theme && applyTheme) {
      try {
        // Try to enable a custom theme
        await executeWithRetry(
          "spo theme apply",
          {
            webUrl,
            name: siteDesign.theme,
          },
          CliCommand.getRetry()
        );
      } catch (e) {
        Logger.debug(
          `It seems that the "${siteDesign.theme}" is not a custom theme. Doctor will try to enable it as a known SharePoint theme.`
        );
        // Try to enable a known SharePoint theme
        try {
          await executeWithRetry(
            "spo theme apply",
            {
              webUrl,
              name: siteDesign.theme,
              sharePointTheme: true,
            },
            CliCommand.getRetry()
          );
        } catch (themeError) {
          const themeErrorMessage = getErrorMessage(themeError);

          if (isAuthOrPermissionError(themeErrorMessage)) {
            Logger.debug(
              `Theme application skipped due to insufficient permissions: ${themeErrorMessage}`
            );
            Logger.debug(
              `Continuing without applying theme \"${siteDesign.theme}\".`
            );
          } else {
            return Promise.reject(
              new Error(
                `Something failed while applying the site theme "${siteDesign.theme}". ${getErrorMessage(
                  themeError
                )}`
              )
            );
          }
        }
        if (siteDesign.theme && !applyTheme) {
          Logger.debug(
            `Skipping site theme "${siteDesign.theme}" because --applyTheme is not enabled.`,
          );
        }
      }
    }

    if (siteDesign.chrome) {
      const chromeOptions: any = {
        siteUrl: webUrl,
      };

      if (siteDesign.chrome.disableFooter) {
        chromeOptions.disableFooter = true;
      }

      if (siteDesign.chrome.disableMegaMenu) {
        chromeOptions.disableMegaMenu = true;
      }

      if (siteDesign.chrome.hideTitleInHeader) {
        chromeOptions.hideTitleInHeader = true;
      }

      if (siteDesign.chrome.footerEmphasis) {
        chromeOptions.footerEmphasis = siteDesign.chrome.footerEmphasis;
      }

      if (siteDesign.chrome.footerLayout) {
        chromeOptions.footerLayout = siteDesign.chrome.footerLayout;
      }

      if (siteDesign.chrome.headerEmphasis) {
        chromeOptions.headerEmphasis = siteDesign.chrome.headerEmphasis;
      }

      if (siteDesign.chrome.headerLayout) {
        chromeOptions.headerLayout = siteDesign.chrome.headerLayout;
      }

      if (siteDesign.chrome.logoAlignment) {
        chromeOptions.logoAlignment = siteDesign.chrome.logoAlignment;
      }

      try {
        await executeWithRetry(
          "spo site chrome set",
          chromeOptions,
          CliCommand.getRetry()
        );
      } catch (e) {
        return Promise.reject(
          new Error(
            `Something failed while setting site chrome options. ${getErrorMessage(
              e
            )}`
          )
        );
      }
    }

    if (typeof siteDesign.logo !== "undefined") {
      try {
        let imgUrl = siteDesign.logo;

        if (imgUrl) {
          const imgPath = join(options.startFolder, siteDesign.logo);

          Logger.debug(
            `Setting site logo with the following path: "${imgPath}"`
          );

          let crntFolder = `${assetLibrary}`;
          crntFolder = await FolderHelpers.create(crntFolder, ["site"], webUrl);

          imgUrl = await FileHelpers.create(
            crntFolder,
            imgPath,
            webUrl,
            overwriteImages
          );
        }

        await executeWithRetry(
          "spo site set",
          {
            url: webUrl,
            siteLogoUrl: imgUrl,
          },
          CliCommand.getRetry()
        );
      } catch (e) {
        const logoErrorMessage = getErrorMessage(e);

        if (isAuthOrPermissionError(logoErrorMessage)) {
          Logger.debug(
            `Site logo update skipped due to insufficient permissions: ${logoErrorMessage}`
          );
          Logger.debug(`Continuing without updating the site logo.`);
        } else {
          return Promise.reject(
            new Error(
              `Something failed while setting the site logo. ${logoErrorMessage}`
            )
          );
        }
      }
    }
  }
}
