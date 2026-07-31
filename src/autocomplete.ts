import omelette from "omelette";
import { Command } from "@commands";
import { OptionsHelper } from "@helpers";

export class Autocomplete {
  private complete: omelette.Instance | null = null;
  private commands: string[] = [
    Command.cleanup,
    Command.init,
    Command.publish,
    Command.version,
  ];

  constructor() {
    this.complete = omelette(`doctor`);
    this.complete.on("complete", this.handleAutocomplete);
    this.complete.init();
  }

  /**
   * Installs shell initialization required for Doctor command autocompletion.
   * @returns Nothing.
   */
  public setup() {
    this.complete?.setupShellInitFile();
  }

  public cleanup() {
    this.complete?.cleanupShellInitFile();
  }

  /**
   * Resolves autocomplete suggestions based on the current command line context.
   * Returns command names for the first argument and available flags for subsequent arguments.
   * @param fragment The current token fragment being completed.
   * @param data Omelette callback payload containing line context and response handler.
   * @returns Nothing. Suggestions are returned through data.reply(...).
   */
  private handleAutocomplete = (
    fragment: string,
    data: omelette.CallbackValue
  ) => {
    let replies: omelette.Choices = [];
    let allWords: string[] = [];

    if (data.fragment === 1) {
      replies = this.commands;
    } else {
      allWords = data.line.split(/\s+/).slice(1, -1);

      if (allWords[0] !== Command.version && allWords[0] !== Command.cleanup) {
        const args = OptionsHelper.getArgs();
        const keys = Object.keys(args);
        replies = keys.filter(
          (k) => !allWords.includes(k) && k.startsWith(`--`)
        );
      }
    }

    data.reply(replies);
  };
}

export const autocomplete = new Autocomplete();
