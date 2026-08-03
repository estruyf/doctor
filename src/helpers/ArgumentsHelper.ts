export class ArgumentsHelper {

  /**
   * Parse the command string to arguments
   * @param command 
   */
  public static parse(command: string) {
    const argsRegEx = /([^\s'"]*(['"]).*?\2[^\s'"]*)|[^\s'"]+/gi;
    return command.match(argsRegEx);
  }
}
