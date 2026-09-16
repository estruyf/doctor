import { join } from "path";
import { existsAsync, isPermissionError } from "@utils";
import { CommandArguments, TaskOutput } from "@models";
import {
  AccessToken,
  ApiHelper,
  CliCommand,
  executeWithRetry,
  FileHelpers,
  FolderHelpers,
  Logger,
  OutputHelper,
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

export class SiteHelpers {
  /**
   * The look of the site is set with calls that need rights on the web, which
   * an account allowed to publish pages does not necessarily have. None of it
   * is worth losing a run over — the pages are already written by then — so a
   * refusal reports what was left alone and the publish carries on. Anything
   * else is a real failure and still stops the run.
   */
  /**
   * Where the site logo actually is.
   *
   * The path used to be taken relative to the content folder, which is not
   * where the rest of `doctor.json` points — `certificate`, `partials.folder`
   * and `markdown.shortcodesFolder` are all relative to the file itself. Both
   * are accepted, content folder first so existing setups keep working, and
   * neither matching says which paths were tried.
   */
  private static async resolveLogoPath(
    startFolder: string,
    logo: string
  ): Promise<string> {
    const inContent = join(startFolder, logo);
    if (await existsAsync(inContent)) {
      return inContent;
    }

    const besideConfig = join(process.cwd(), logo);
    if (await existsAsync(besideConfig)) {
      Logger.debug(`Site logo found next to doctor.json: ${besideConfig}`);
      return besideConfig;
    }

    throw new Error(
      `The site logo "${logo}" does not exist. Doctor looked in "${inContent}" and "${besideConfig}". The path is taken relative to the content folder, or to doctor.json.`
    );
  }

  /**
   * Point the site at its logo.
   *
   * Done directly rather than with `spo site set`, which reaches the tenant
   * admin site before it gets to the logo: it derives the admin URL from the
   * SharePoint root, and falls back to a Microsoft Graph call to find it. An
   * app scoped to a single site with `Sites.Selected` cannot make that call,
   * and the failure surfaces as "Cannot read properties of undefined (reading
   * 'replace')" rather than anything to do with the logo.
   *
   * Setting the logo itself is a site-scoped call, which is all that is needed.
   */
  private static async setSiteLogo(
    webUrl: string,
    logoUrl: string
  ): Promise<void> {
    const base = webUrl.replace(/\/+$/, "");

    // The endpoint takes a server relative path, not the absolute URL the
    // upload hands back
    let relativeLogoUrl = logoUrl;
    try {
      relativeLogoUrl = new URL(logoUrl).pathname;
    } catch {
      // Already relative
    }

    Logger.debug(`Setting the site logo to ${relativeLogoUrl}`);

    await ApiHelper.postOrThrow(
      `${base}/_api/siteiconmanager/setsitelogo`,
      {
        Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
        accept: "application/json;odata=nometadata",
        "content-type": "application/json;odata=nometadata",
      },
      {
        aspect: 1,
        relativeLogoUrl,
        type: 0,
      }
    );
  }

  private static skipIfNotAllowed(
    error: unknown,
    what: string,
    action: string
  ): void {
    const message = getErrorMessage(error);

    if (!isPermissionError(message)) {
      throw new Error(`Something failed while ${action}. ${message}`);
    }

    Logger.debug(`${what} skipped: ${message}`);
    OutputHelper.warning(
      `This account is not allowed to ${what.toLowerCase()} on this site, so it was left as it is. The pages themselves were published. Granting it Manage Web rights on the site, or removing the matching 'siteDesign' setting, stops this being reported.`
    );
  }

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
          SiteHelpers.skipIfNotAllowed(
            themeError,
            "Change the site theme",
            `applying the site theme "${siteDesign.theme}"`
          );
        }
      }
    } else if (siteDesign.theme) {
      Logger.debug(
        `Skipping site theme "${siteDesign.theme}" because the "applyTheme" option is not enabled.`
      );
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
        SiteHelpers.skipIfNotAllowed(
          e,
          "Change the site header and footer",
          "setting site chrome options"
        );
      }
    }

    if (typeof siteDesign.logo !== "undefined") {
      try {
        let imgUrl = siteDesign.logo;

        if (imgUrl) {
          const imgPath = await SiteHelpers.resolveLogoPath(
            options.startFolder,
            siteDesign.logo
          );

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

        await SiteHelpers.setSiteLogo(webUrl, imgUrl);
      } catch (e) {
        SiteHelpers.skipIfNotAllowed(
          e,
          "Change the site logo",
          "setting the site logo"
        );
      }
    }
  }
}
