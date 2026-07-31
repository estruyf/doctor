import { Listr } from "listr2";
import kleur from "kleur";
import { Authenticate } from "@commands";
import {
  DoctorTranspiler,
  FileHelpers,
  Logger,
  MarkdownHelper,
  NavigationHelper,
  SiteHelpers,
  PagesHelper,
  MultilingualHelper,
  StatusHelper,
} from "@helpers";
import { CommandArguments, PublishContext, PublishOutput } from "@models";
import { existsAsync } from "@utils";

export class Publish {
  /**
   * Publishes markdown content and assets to SharePoint using the configured
   * processing pipeline (cleanup, transpile, navigation, design, and post-cleanup).
   * @param options Command options that control authentication, source paths, and publish behavior.
   * @returns A promise that resolves when the publish pipeline completes.
   */
  public static async start(options: CommandArguments) {
    Logger.debug(
      `Running with the following options: ${Logger.mask(
        JSON.stringify(options),
        [options.password, options.certificateBase64Encoded]
      )}`
    );

    if (!(await existsAsync(options.startFolder))) {
      return Promise.reject(
        new Error(`The provided folder location doesn't exist.`)
      );
    }

    if (!options.webUrl) {
      return Promise.reject(
        new Error(
          `In order to run the publish command, you need to specify the '--url' property.`
        )
      );
    }

    const { startFolder, webUrl } = options;

    let ouput: PublishOutput = {
      navigation: options.menu ? { ...options.menu } : null,
    };

    // Initializes the authentication
    await Authenticate.init(options);

    await new Listr<PublishContext, "default", "verbose">(
      [
        {
          title: `Clean up all the files`,
          task: async () => {
            await FileHelpers.cleanUp(options, "sitepages");
            await FileHelpers.cleanUp(options, options.assetLibrary);
          },
          enabled: () => options.cleanStart && options.confirm,
        },
        {
          title: `Multilingual site configuration`,
          task: async (ctx, task) =>
            await MultilingualHelper.start(task, options),
          enabled: () => !!options.multilingual?.enableTranslations,
        },
        {
          title: `Fetch all markdown files`,
          task: async (ctx, task) =>
            await MarkdownHelper.fetchMDFiles(ctx, task, startFolder),
          enabled: () => !options.skipPages,
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Process markdown files`,
          task: async (ctx, task) =>
            await DoctorTranspiler.processMDFiles(ctx, task, options, ouput),
          enabled: () => !options.skipPages,
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Updating navigation`,
          task: async () =>
            await NavigationHelper.update(webUrl, ouput.navigation),
          enabled: () => !options.skipNavigation,
        },
        {
          title: `Change the look of the site`,
          task: async (ctx, task) => await SiteHelpers.changeLook(task, options),
          enabled: () => !!options.siteDesign && !options.skipSiteDesign,
        },
        {
          title: `Post cleanup`,
          task: async (ctx, task) =>
            await PagesHelper.clean(webUrl, task, options),
          enabled: () => options.cleanEnd && options.confirm,
          rendererOptions: { persistentOutput: true },
        },
      ],
      {
        renderer: "default",
        fallbackRenderer: "verbose",
        fallbackRendererCondition: options.debug,
      }
    )
      .run()
      .catch((err) => {
        console.log("");
        console.log(
          kleur.bgRed().bold().white(` Command retries: `),
          kleur.bold().red(StatusHelper.getRetries())
        );
        throw err;
      });

    console.log("");
    console.info(kleur.bold().bgYellow().black(` Publishing stats `));
    console.info(kleur.white(` Pages: ${StatusHelper.getPages()}`));
    console.info(kleur.white(` Images: ${StatusHelper.getImages()}`));
    console.info(kleur.white(` Retries: ${StatusHelper.getRetries()}`));
  }
}

