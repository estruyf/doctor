import { CommandArguments } from "@models";

export class CliCommand {
  private static cmdName: string = "m365";
  private static retry: boolean = false;
  private static cleanQuickLaunch: boolean = false;
  private static cleanTopNavigation: boolean = false;
  public static options: CommandArguments | null = null;

  public static init(options: CommandArguments) {
    CliCommand.cmdName = options.commandName || `m365`;
    CliCommand.retry = options.retryWhenFailed || false;
    CliCommand.cleanQuickLaunch = options.cleanQuickLaunch || false;
    CliCommand.cleanTopNavigation = options.cleanTopNavigation || false;
    CliCommand.options = Object.assign({}, options);
  }

  public static getName() {
    return CliCommand.cmdName;
  }

  public static getRetry() {
    return CliCommand.retry;
  }

  public static getCleanNavigation() {
    return {
      cleanQuickLaunch: CliCommand.cleanQuickLaunch,
      cleanTopNavigation: CliCommand.cleanTopNavigation,
    };
  }

  public static reset() {
    CliCommand.cmdName = "m365";
    CliCommand.retry = false;
    CliCommand.cleanQuickLaunch = false;
    CliCommand.cleanTopNavigation = false;
    CliCommand.options = null;
  }
}
