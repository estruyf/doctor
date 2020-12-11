import { Publish } from './commands/publish';
import * as kleur from 'kleur';
import * as fs from 'fs';
import { CommandArguments } from './models/CommandArguments';


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

      if (!fs.existsSync(options.startFolder)) {
        return Promise.reject(new Error(`The provided folder location doesn't exist.`));
      }

      if (options.task === "build") {
        console.log(kleur.green('Starting build'));
      } else if (options.task === "publish") {
        await Publish.start(options);
      }


      console.log('');
      const hrend = process.hrtime(hrstart);
      console.info(kleur.bold().bgMagenta().white(` EXECUTION TIME: `), `${hrend[0]}sec.`);
      console.log(kleur.bold().bgMagenta().white(` COMPLETED: `), `${options.task} job`);
      console.log('');
    }
  }
}