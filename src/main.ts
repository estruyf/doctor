import * as kleur from 'kleur';
import { Publish } from './commands/publish';
import { CommandArguments } from './models/CommandArguments';
import { Init } from './commands/init';
import { Version } from './commands/version';
import { Command } from './commands/Command';
import { Logger } from './helpers/logger';
import { CliCommand } from './helpers/CliCommand';
import { ShortcodesHelpers } from './helpers';
import { TelemetryHelper } from './helpers/TelemetryHelper';
import { autocomplete } from './autocomplete';

export class Commands {

  /**
   * Starts the command processing
   * @param options 
   */
  public static async start(options: CommandArguments) {

    if (options) {
      const hrstart = process.hrtime();

      // Disable the CLI update check to speed up the process
      process.env['CLIMICROSOFT365_NOUPDATE'] = '1';

      Logger.init(options.debug);        
      CliCommand.init(options);
      TelemetryHelper.trackTask(options);

      console.log('');
      console.log(kleur.bold().bgMagenta().white(` START: `), `${options.task} job`);
      console.log('');

      if (options.task === Command.publish) {
        if (options.markdown && options.markdown.allowHtml) {
          console.info(kleur.bold().bgYellow().black(` Warning: `), `You specified to allow custom HTML usage in Doctor. Be aware that once you modify the page on SharePoint itself, the HTML will be overwritten. Best is to maintain content from the Doctor sources.
          `);

          await ShortcodesHelpers.init(options.shortcodesFolder);
        }

        await Publish.start(options);
      } else if (options.task === Command.init) {
        await Init.start(options);
      } else if (options.task === Command.version) {
        Version.start();
      } else if (options.task === Command.setup) {
        autocomplete.setup()
      } else if (options.task === Command.cleanup) {
        autocomplete.cleanup();
      }

      console.log('');
      const hrend = process.hrtime(hrstart);
      console.info(kleur.bold().bgMagenta().white(` EXECUTION TIME: `), `${hrend[0]}sec.`);
      console.log(kleur.bold().bgMagenta().white(` COMPLETED: `), `${options.task} job`);
      console.log('');
    }
  }
}