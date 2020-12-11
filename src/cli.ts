import kleur = require("kleur");
import { OptionsHelper } from "./helpers/OptionsHelper";
import { Commands } from "./main";

export async function cli(args: string[]) {
  let options = OptionsHelper.fetchConfig();
  options = OptionsHelper.parseArguments(options, args);
  options = await OptionsHelper.promptForMissingArgs(options);
  try {
    await Commands.start(options);
  } catch (e) {
    console.log(kleur.bgRed().bold().white(` ERROR: `), kleur.bold().red(e.message));
  }
}