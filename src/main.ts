import * as kleur from 'kleur';
import { Publish } from './commands/publish';
import { CommandArguments } from './models/CommandArguments';
import { Init } from './commands/init';
import { execScript } from './helpers/execScript';
import { Version } from './commands/version';
import { Command } from './commands/Command';

export class Commands {

  /**
   * Starts the command processing
   * @param options 
   */
  public static async start(options: CommandArguments) {

    if (options) {
      const hrstart = process.hrtime();

      console.log('');
      console.log(kleur.bold().bgMagenta().white(` START: `), `${options.task} job`);
      console.log('');

      if (!options.skipPrecheck) {
        try {
          await execScript("localm365");
        } catch (e) {
          console.error(kleur.bold().bgRed().white(` Error: `), kleur.red(`It seems the CLI for Microsoft 365 is not installed. Please install the Microsoft 365 CLI by executing: $ npm i -g @pnp/cli-microsoft365`));
          return;
        }
      }

      if (options.task === "build") {
        console.log(kleur.green('Starting build'));
      } else if (options.task === Command.publish) {
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