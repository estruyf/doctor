import kleur = require("kleur");
import { Command } from "./commands/Command";
import { Version } from "./commands/version";
import { OptionsHelper } from "./helpers/OptionsHelper";
import { TempDataHelper } from "./helpers/TempDataHelper";
import { Commands } from "./main";
import { CommandArguments } from "./models/CommandArguments";

export async function cli(args: string[]) {

  const version = Version.getVersion();
  console.log('');
  console.log(kleur.bgBlue().white(`   DOCTOR v${version}   `));
  
  let options: CommandArguments = OptionsHelper.fetchConfig();
  options = OptionsHelper.parseArguments(options, args);
  options = await OptionsHelper.promptForMissingArgs(options);
  
  try {
    if (options.task === "help") {
      console.log('');
      console.log(kleur.blue('Maintain your documentation on SharePoint without pain!'));
      console.log('');
      console.log(`The current version you're running (v${version}), supports the following commands: ${Object.keys(Command).join(', ')}.`);
      console.log('');
      console.log('Documentation: https://github.com/estruyf/doctor');
      console.log('');
      console.log(kleur.blue().italic('Created by Elio Struyf - https://www.eliostruyf.com - @eliostruyf'));
      console.log('');
    } else {
      await Commands.start(options);
      TempDataHelper.clear();
    }
    process.exit(0);
  } catch (e: any | Error) {
    TempDataHelper.clear();

    console.log(kleur.bgRed().bold().white(` ERROR: `), kleur.bold().red(e.message.toString()));
    process.exit(1);
  }
}