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
  PrecheckHelper,
  StateHelper,
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
    const publishStart = Date.now();
    Logger.debug(
      `Running with the following options: ${Logger.mask(
        JSON.stringify(options),
        [options.password, options.certificateBase64Encoded].filter((v): v is string => !!v)
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
          title: `Load publish state`,
          task: async () =>
            await StateHelper.load(webUrl, options.assetLibrary, options.stateFile),
          enabled: () => !options.disableStatePersistence && !options.skipPages,
        },
        {
          title: `Fetch all markdown files`,
          task: async (ctx, task) =>
            await MarkdownHelper.fetchMDFiles(ctx, task, startFolder),
          enabled: () => !options.skipPages,
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Pre-process checks`,
          task: async (ctx, task) =>
            await PrecheckHelper.validate(ctx, task, options),
          enabled: () => !options.skipPages && !options.skipPrecheck,
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
            await NavigationHelper.update(webUrl, ouput.navigation ?? undefined),
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
        {
          title: `Save publish state`,
          task: async () =>
            await StateHelper.save(webUrl, options.assetLibrary, options.stateFile),
          enabled: () => !options.disableStatePersistence && !options.skipPages,
        },
      ],
      {
        renderer: "default",
        fallbackRenderer: "verbose",
        fallbackRendererCondition: options.debug || options.verbose,
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

    const created = StatusHelper.getPagesCreated();
    const updated = StatusHelper.getPagesUpdated();
    const skipped = StatusHelper.getPagesSkipped();
    const imagesUploaded = StatusHelper.getImages();
    const imagesSkipped = StatusHelper.getImagesSkipped();
    const retries = StatusHelper.getRetries();
    const errors = StatusHelper.getErrors();
    const totalDurationMs = Date.now() - publishStart;

    const pageDetail = [
      created > 0 ? `${created} created` : null,
      updated > 0 ? `${updated} updated` : null,
      skipped > 0 ? `${skipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const imageDetail = [
      imagesUploaded > 0 ? `${imagesUploaded} uploaded` : null,
      imagesSkipped > 0 ? `${imagesSkipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    console.log("");
    console.info(kleur.bold().bgYellow().black(` Publishing stats `));
    console.info(
      kleur.white(
        ` Pages:   ${created + updated + skipped}${pageDetail ? `  (${pageDetail})` : ""}`,
      ),
    );
    console.info(
      kleur.white(
        ` Images:  ${imagesUploaded + imagesSkipped}${imageDetail ? `  (${imageDetail})` : ""}`,
      ),
    );
    console.info(kleur.white(` Retries: ${retries}`));
    console.info(kleur.white(` Time:    ${this.formatDuration(totalDurationMs)}`));

    if (options.timingDetails) {
      const timingStats = StatusHelper.getPageTimingStats();
      if (timingStats) {
        console.info(kleur.white(` Avg/page: ${this.formatDuration(timingStats.averageMs)}`));
        console.info(
          kleur.white(
            ` Fastest: ${this.formatDuration(timingStats.fastest.durationMs)} (${timingStats.fastest.filePath})`,
          ),
        );
        console.info(
          kleur.white(
            ` Slowest: ${this.formatDuration(timingStats.slowest.durationMs)} (${timingStats.slowest.filePath})`,
          ),
        );
      }
    }
    if (errors > 0) {
      console.info(kleur.bold().red(` Errors:  ${errors}`));
    }
  }

  private static formatDuration(durationMs: number): string {
    const safeDurationMs = Math.max(0, Math.round(durationMs));
    const totalSeconds = Math.floor(safeDurationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = safeDurationMs % 1000;

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    if (totalSeconds > 0) {
      return `${totalSeconds}.${`${milliseconds}`.padStart(3, "0")}s`;
    }

    return `${safeDurationMs}ms`;
  }
}
