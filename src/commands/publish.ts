import { Listr } from "listr2";
import kleur from "kleur";
import { Authenticate, Version } from "@commands";
import {
  DoctorTranspiler,
  FileHelpers,
  Logger,
  MarkdownHelper,
  NavigationHelper,
  OutputHelper,
  SiteHelpers,
  PagesHelper,
  MultilingualHelper,
  PartialsHelper,
  PrecheckHelper,
  StateHelper,
  StatusHelper,
} from "@helpers";
import {
  CommandArguments,
  PublishContext,
  PublishOutput,
  PublishResult,
} from "@models";
import { existsAsync, relativePath } from "@utils";

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
      `Running with the following options: ${JSON.stringify(
        Logger.redact(options)
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

    if (options.removeDeleted && !options.confirm) {
      OutputHelper.warning(
        `Deleted pages are not removed, as the removal was not confirmed. Pass the '--confirm' flag together with '--removeDeleted' to recycle them.`
      );
    }

    if (options.removeDeleted && options.disableStatePersistence) {
      OutputHelper.warning(
        `Deleted pages are not removed, as '--disableStatePersistence' is used. Doctor needs the publish state to know which pages it created.`
      );
    }

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
            await MarkdownHelper.fetchMDFiles(
              ctx,
              task,
              startFolder,
              PartialsHelper.getIgnorePatterns(options)
            ),
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
          // Runs after all the normal pages, as a translation can only be
          // created once its source page exists on the site
          title: `Process localized pages`,
          task: async (ctx, task) =>
            await DoctorTranspiler.processTranslations(
              ctx.files || [],
              task,
              options,
              ouput
            ),
          enabled: () =>
            !options.skipPages && !!options.multilingual?.enableTranslations,
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Remove deleted pages`,
          task: async (ctx, task) => {
            const { slugs, unresolved } = await DoctorTranspiler.collectLocalSlugs(
              ctx.files || [],
              options,
            );

            // Without a slug for every file, a page which does exist locally
            // could be mistaken for a deleted one. Removing nothing is the
            // safer outcome here.
            if (unresolved.length > 0) {
              task.skip(
                `Skipped: ${unresolved.length} file${unresolved.length === 1 ? "" : "s"} could not be resolved to a page. Fix them, or run without --skipPrecheck, before removing deleted pages.`,
              );
              return;
            }

            const deleted = StateHelper.getDeletedSlugs(slugs, {
              multilingual: !!options.multilingual?.enableTranslations,
            });

            if (deleted.length === 0) {
              task.skip(`No deleted pages found`);
              return;
            }

            try {
              const removed = await PagesHelper.removePages(
                webUrl,
                deleted,
                task,
                options,
                (slug) => StateHelper.removeTracked(slug),
              );

              StatusHelper.addPagesRemoved(removed.length);
              task.output = `Recycled ${removed.length} deleted page${removed.length === 1 ? "" : "s"}`;
            } finally {
              // Persist right away, so a failure halfway does not leave the
              // state pointing to pages which are already recycled.
              if (StateHelper.isDirty()) {
                await StateHelper.save(
                  webUrl,
                  options.assetLibrary,
                  options.stateFile,
                );
              }
            }
          },
          enabled: () =>
            options.removeDeleted &&
            options.confirm &&
            !options.skipPages &&
            !options.disableStatePersistence,
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
          task: async (_, task) => {
            if (!StateHelper.isDirty()) {
              task.skip(`No changes to save`);
              return;
            }
            await StateHelper.save(webUrl, options.assetLibrary, options.stateFile);
          },
          enabled: () => !options.disableStatePersistence && !options.skipPages,
        },
      ],
      {
        renderer: "default",
        fallbackRenderer: "verbose",
        fallbackRendererCondition: options.debug || options.verbose,
        silentRendererCondition: OutputHelper.isJson(),
      }
    )
      .run()
      .catch((err) => {
        OutputHelper.log("");
        OutputHelper.log(
          kleur.bgRed().bold().white(` Command retries: `),
          kleur.bold().red(StatusHelper.getRetries())
        );
        throw err;
      });

    const created = StatusHelper.getPagesCreated();
    const updated = StatusHelper.getPagesUpdated();
    const skipped = StatusHelper.getPagesSkipped();
    const removed = StatusHelper.getPagesRemoved();
    const imagesUploaded = StatusHelper.getImages();
    const imagesSkipped = StatusHelper.getImagesSkipped();
    const retries = StatusHelper.getRetries();
    const errors = StatusHelper.getErrors();
    const totalDurationMs = Date.now() - publishStart;
    const timingStats = StatusHelper.getPageTimingStats();

    if (OutputHelper.isJson()) {
      const result: PublishResult = {
        command: "publish",
        // A run which continued after a failure still exits with code 0, so the
        // errors are what a pipeline has to gate on.
        success: errors === 0,
        version: await Version.getVersion(),
        url: webUrl,
        summary: {
          pages: {
            total: created + updated + skipped,
            created,
            updated,
            skipped,
            removed,
          },
          images: {
            total: imagesUploaded + imagesSkipped,
            uploaded: imagesUploaded,
            skipped: imagesSkipped,
          },
          retries,
          errors,
          durationMs: totalDurationMs,
        },
        failedFiles: StatusHelper.getFailedFiles().map((file) =>
          relativePath(file)
        ),
        warnings: StatusHelper.getWarnings(),
      };

      if (options.timingDetails && timingStats) {
        result.timings = {
          count: timingStats.count,
          averageMs: timingStats.averageMs,
          fastest: {
            file: relativePath(timingStats.fastest.filePath),
            durationMs: timingStats.fastest.durationMs,
          },
          slowest: {
            file: relativePath(timingStats.slowest.filePath),
            durationMs: timingStats.slowest.durationMs,
          },
        };
      }

      OutputHelper.setResult(result);
      return;
    }

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
    if (removed > 0) {
      console.info(
        kleur.white(` Removed: ${removed}  (recycled, deleted from the sources)`),
      );
    }
    console.info(
      kleur.white(
        ` Images:  ${imagesUploaded + imagesSkipped}${imageDetail ? `  (${imageDetail})` : ""}`,
      ),
    );
    console.info(kleur.white(` Retries: ${retries}`));
    console.info(kleur.white(` Time:    ${this.formatDuration(totalDurationMs)}`));

    if (options.timingDetails) {
      if (timingStats) {
        console.info(kleur.white(` Avg/page: ${this.formatDuration(timingStats.averageMs)}`));
        console.info(
          kleur.white(
            ` Fastest: ${this.formatDuration(timingStats.fastest.durationMs)} (${relativePath(timingStats.fastest.filePath)})`,
          ),
        );
        console.info(
          kleur.white(
            ` Slowest: ${this.formatDuration(timingStats.slowest.durationMs)} (${relativePath(timingStats.slowest.filePath)})`,
          ),
        );
      }
    }
    if (errors > 0) {
      console.info(kleur.bold().red(` Errors:  ${errors}`));

      // List the failing files, otherwise a --continueOnError run only reports
      // a count and gives no way to find the offending pages.
      const failedFiles = StatusHelper.getFailedFiles();
      for (const failedFile of failedFiles) {
        console.info(kleur.red(`   - ${relativePath(failedFile)}`));
      }
    }

    // Things which were skipped on purpose, like a locale which cannot be
    // machine translated. Reported here so they do not scroll past unnoticed.
    const warnings = StatusHelper.getWarnings();
    if (warnings.length > 0) {
      console.log("");
      console.info(kleur.bold().bgYellow().black(` Warnings `));
      for (const warning of warnings) {
        console.info(kleur.yellow(`   - ${warning}`));
      }
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
