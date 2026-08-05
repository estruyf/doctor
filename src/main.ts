import kleur from "kleur";
import { Command, Init, Publish, Status, Version, Workflow } from "@commands";
import { CommandArguments } from "@models";
import {
  CliCommand,
  FileHelpers,
  FolderHelpers,
  ListHelpers,
  Logger,
  NavigationHelper,
  OutputHelper,
  PagesHelper,
  PartialsHelper,
  StateHelper,
  ShortcodesHelpers,
  StatusHelper,
} from "@helpers";
import { autocomplete } from "./autocomplete.js";

export class Commands {
  /**
  * Dispatches the selected command and handles shared runtime initialization,
  * logging, shortcode setup, and execution timing output.
  * @param options Parsed command options used to determine which command to run.
  * @returns A promise that resolves when the selected command flow completes.
   */
  public static async start(options: CommandArguments) {
    if (options) {
      const hrstart = process.hrtime();

      // Disable the CLI update check to speed up the process
      process.env["CLIMICROSOFT365_NOUPDATE"] = "1";

      Commands.resetRuntimeState();
      Logger.init(options.debug);
      // Before any other helper, as they report through it
      OutputHelper.init(options);
      CliCommand.init(options);
      PartialsHelper.init(options);

      OutputHelper.log("");
      OutputHelper.log(
        kleur.bold().bgMagenta().white(` START: `),
        `${options.task} job`
      );
      OutputHelper.log("");

      if (options.task === Command.publish) {
        if (options.markdown && options.markdown.allowHtml) {
          OutputHelper.warning(
            `You specified to allow custom HTML usage in Doctor. Be aware that once you modify the page on SharePoint itself, the HTML will be overwritten. Best is to maintain content from the Doctor sources.`
          );

          await ShortcodesHelpers.init(options.shortcodesFolder);
        }

        await Publish.start(options);
      } else if (options.task === Command.init) {
        await Init.start(options);
      } else if (options.task === Command.workflow) {
        await Workflow.start(options);
      } else if (options.task === Command.version) {
        await Version.start();
      } else if (options.task === Command.status) {
        await Status.start(options);
      } else if (options.task === Command.setup) {
        autocomplete.setup();
      } else if (options.task === Command.cleanup) {
        autocomplete.cleanup();
      }

      // Written last, so the JSON document is the only thing on stdout and a
      // command which reported nothing structured still returns a result.
      if (OutputHelper.isJson()) {
        OutputHelper.flush({
          command: options.task,
          version: await Version.getVersion(),
        });
        return;
      }

      console.log("");
      const hrend = process.hrtime(hrstart);
      console.info(
        kleur.bold().bgMagenta().white(` EXECUTION TIME: `),
        `${hrend[0]}sec.`
      );
      console.log(
        kleur.bold().bgMagenta().white(` COMPLETED: `),
        `${options.task} job`
      );
      console.log("");
    }
  }

  private static resetRuntimeState() {
    Logger.reset();
    OutputHelper.reset();
    CliCommand.reset();
    StatusHelper.reset();
    ShortcodesHelpers.reset();
    PartialsHelper.reset();
    StateHelper.reset();
    NavigationHelper.reset();
    FileHelpers.reset();
    PagesHelper.reset();
    ListHelpers.reset();
    FolderHelpers.reset();
  }
}
