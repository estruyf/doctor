

export class ArgumentsHelper {

  /**
   * Parse the command string to arguments
   * @param command 
   */
  public static parse(command: string) {
    const argsRegEx = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s"']+/g;
    const args: string[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = argsRegEx.exec(command)) !== null) {
      args.push(match[1] || match[2] || match[0]);
    }

    return args;
  }
}