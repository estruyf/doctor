import { CommandArguments } from "@models";
import { OutputHelper } from "./OutputHelper.js";

export const DEFAULT_COMMAND_TIMEOUT = 120000;

export class CliCommand {
  private static cmdName: string = "m365";
  private static retry: boolean = false;
  private static cleanQuickLaunch: boolean = false;
  private static cleanTopNavigation: boolean = false;
  private static timeout: number = DEFAULT_COMMAND_TIMEOUT;
  public static options: CommandArguments | null = null;

  public static init(options: CommandArguments) {
    CliCommand.cmdName = options.commandName || `m365`;
    CliCommand.retry = options.retryWhenFailed || false;
    CliCommand.cleanQuickLaunch = options.cleanQuickLaunch || false;
    CliCommand.cleanTopNavigation = options.cleanTopNavigation || false;
    CliCommand.timeout = CliCommand.parseTimeout(options.commandTimeout);
    CliCommand.options = Object.assign({}, options);
  }

  public static getName() {
    return CliCommand.cmdName;
  }

  public static getRetry() {
    return CliCommand.retry;
  }

  /**
   * The timeout in milliseconds for each command execution
   */
  public static getTimeout() {
    return CliCommand.timeout;
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
    CliCommand.timeout = DEFAULT_COMMAND_TIMEOUT;
    CliCommand.options = null;
  }

  /**
   * Validates the configured command timeout, and falls back to the default
   * when no valid value was provided.
   * @param value
   */
  private static parseTimeout(value: unknown): number {
    if (typeof value === "undefined" || value === null || value === "") {
      return DEFAULT_COMMAND_TIMEOUT;
    }

    // Allow the value to be provided as a string, as it can come from doctor.json
    const timeout = typeof value === "string" ? Number(value.trim()) : value;

    if (!Number.isInteger(timeout) || (timeout as number) <= 0) {
      OutputHelper.warning(
        `The "commandTimeout" option must be a whole number of milliseconds greater than 0, but received "${value}". Doctor continues with the default of ${DEFAULT_COMMAND_TIMEOUT}ms.`
      );
      return DEFAULT_COMMAND_TIMEOUT;
    }

    if ((timeout as number) < 1000) {
      OutputHelper.warning(
        `The "commandTimeout" option is set to ${timeout}ms. This value is in milliseconds, so commands will most likely time out before they complete.`
      );
    }

    return timeout as number;
  }
}
