

export class ArgumentsHelper {

  /**
   * Parse the command string to arguments
   * @param command 
   */
  public static parse(command: string) {
    const argsRegEx = /([^\s'"]([^\s'"]*(['"])([^\3]*?)\3)+[^\s'"]*)|[^\s'"]+|(['"])([^\5]*?)\5/gi;
    return command.match(argsRegEx);
  }
}