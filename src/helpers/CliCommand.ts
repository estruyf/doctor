
export class CliCommand {
  private static cmdName: string = "localm365";
  
  public static init(value: string = "localm365") {
    CliCommand.cmdName = value;
  }

  public static getName() {
    return CliCommand.cmdName;
  }
}