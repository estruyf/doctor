import kleur = require("kleur");
import { Command } from "./commands/Command";
import { Version } from "./commands/version";
import { OptionsHelper } from "./helpers/OptionsHelper";
import { Commands } from "./main";
import { CommandArguments } from "./models/CommandArguments";

export async function cli(args: string[]) {
  let options: CommandArguments = OptionsHelper.fetchConfig();
  options = OptionsHelper.parseArguments(options, args);
  options = await OptionsHelper.promptForMissingArgs(options);
  
  try {
    if (options.task === "help") {
      const version = Version.getVersion();
      console.log('');
      console.log(kleur.bgBlue().white('   DOCTOR   '));
      console.log('The static site generator for SharePoint. Created by Valo.');
      console.log('');
      console.log(`The current version you're running: ${version} supports the following commands: ${Object.keys(Command).join(', ')}.`);
      console.log('');
      console.log('Documentation: https://github.com/ValoIntranet/doctor');
      console.log('');
    } else {
      await Commands.start(options);
    }
  } catch (e) {
    console.log(kleur.bgRed().bold().white(` ERROR: `), kleur.bold().red(e.message));
  }
}