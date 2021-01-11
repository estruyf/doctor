import * as kleur from 'kleur';
import { Publish } from './commands/publish';
import { CommandArguments } from './models/CommandArguments';
import { Init } from './commands/init';
import { execScript } from './helpers/execScript';
import { Version } from './commands/version';
import { Command } from './commands/Command';
import { Logger } from './helpers/logger';

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

      console.log('');
      console.log(kleur.bold().bgMagenta().white(` START: `), `${options.task} job`);
      console.log('');

      if (!options.skipPrecheck && options.task !== Command.version) {
        try {
          await execScript("localm365");
        } catch (e) {
          throw "Something is wrong with the local @pnp/cli-microsoft365 version";
        }
      }

      if (options.task === Command.publish) {
        await Publish.start(options);
      } else if (options.task === Command.init) {
        await Init.start(options);
      } else if (options.task === Command.version) {
        Version.start();
      }


      console.log('');
      const hrend = process.hrtime(hrstart);
      console.info(kleur.bold().bgMagenta().white(` EXECUTION TIME: `), `${hrend[0]}sec.`);
      console.log(kleur.bold().bgMagenta().white(` COMPLETED: `), `${options.task} job`);
      console.log('');
    }
  }
}