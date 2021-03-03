import { CommandArguments } from "src/models";

export class CliCommand {
  private static cmdName: string = "localm365";
  private static retry: boolean = false;
  private static disableTracking: boolean = false;
  
  public static init(options: CommandArguments) {
    CliCommand.cmdName = options.commandName || `localm365`;
    CliCommand.retry = options.retryWhenFailed || false;
    CliCommand.disableTracking = options.disableTracking || false;
  }

  public static getName() {
    return CliCommand.cmdName;
  }

  public static getRetry() {
    return CliCommand.retry;
  }

  public static getDisableTracking() {
    return CliCommand.disableTracking;
  }
}