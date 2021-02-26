
export class CliCommand {
  private static cmdName: string = "localm365";
  private static retry: boolean = false;
  
  public static init(cmdName: string = "localm365", retry: boolean = false) {
    CliCommand.cmdName = cmdName;
    CliCommand.retry = retry;
  }

  public static getName() {
    return CliCommand.cmdName;
  }

  public static getRetry() {
    return CliCommand.retry;
  }
}