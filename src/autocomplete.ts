import * as omelette from "omelette";
import { Command } from "@commands";
import { OptionsHelper } from "@helpers";

export class Autocomplete {
  private complete: omelette.Instance = null;
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
   * Install the autocomplete functionality
   */
  public setup() {
    this.complete.setupShellInitFile();
  }

  /**
   * Cleanup the autocomplete functionality
   */
  public cleanup() {
    this.complete.cleanupShellInitFile();
  }

  /**
   * Handles the autocomplete per command
   * @param fragment
   * @param data
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
