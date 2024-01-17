import kleur = require("kleur");
import { Command, Version } from "@commands";
import { OptionsHelper, TempDataHelper } from "@helpers";
import { Commands } from "./main";
import { CommandArguments } from "@models";

export async function cli(args: string[]) {
  const version = await Version.getVersion();
  console.log("");
  console.log(kleur.bgBlue().white(`   DOCTOR v${version}   `));

  let options: CommandArguments = await OptionsHelper.fetchConfig();
  options = OptionsHelper.parseArguments(options, args);
  options = await OptionsHelper.promptForMissingArgs(options);

  try {
    if (options.task === "help") {
      console.log("");
      console.log(
        kleur.blue("Maintain your documentation on SharePoint without pain!")
      );
      console.log("");
      console.log(
        `The current version you're running (v${version}), supports the following commands: ${Object.keys(
          Command
        ).join(", ")}.`
      );
      console.log("");
      console.log("Documentation: https://github.com/estruyf/doctor");
      console.log("");
      console.log(
        kleur
          .blue()
          .italic(
            "Created by Elio Struyf - https://www.eliostruyf.com - @eliostruyf"
          )
      );
      console.log("");
    } else {
      await Commands.start(options);
      await TempDataHelper.clear();
    }
    process.exit(0);
  } catch (e: any | Error) {
    await TempDataHelper.clear();

    console.log(
      kleur.bgRed().bold().white(` ERROR: `),
      kleur.bold().red(e.message.toString())
    );
    process.exit(1);
  }
}
