import kleur from "kleur";
import { CommandResult, OutputFormat } from "@models";
import { StatusHelper } from "./StatusHelper.js";

const DEFAULT_FORMAT: OutputFormat = "default";
const SUPPORTED_FORMATS: OutputFormat[] = ["default", "json"];

/**
 * The single place where `doctor` writes to stdout.
 *
 * With `--output json` the human readable output has to disappear completely,
 * otherwise the document a pipeline parses is prefixed with progress text. So
 * every stdout write goes through here instead of calling `console` directly,
 * and the run ends with exactly one JSON document written by `flush()`.
 *
 * Debug output is not affected: it goes to stderr, which never mixes with the
 * parsed document.
 */
export class OutputHelper {
  private static format: OutputFormat = DEFAULT_FORMAT;
  private static result: Record<string, unknown> | null = null;

  /**
   * Initializes the output format for the current run.
   * @param options The parsed command options.
   */
  public static init(options?: { output?: OutputFormat | null }) {
    OutputHelper.format = options?.output || DEFAULT_FORMAT;
    OutputHelper.result = null;
  }

  public static reset() {
    OutputHelper.format = DEFAULT_FORMAT;
    OutputHelper.result = null;
  }

  /**
   * Validates a format coming from an argument or the `doctor.json` file.
   *
   * An unknown value throws instead of falling back to the default: a typo like
   * `--output jsonn` would otherwise hand a pipeline human output to parse.
   * @param value The configured value.
   * @returns The validated output format.
   */
  public static parseFormat(value: unknown): OutputFormat {
    if (typeof value === "undefined" || value === null || value === "") {
      return DEFAULT_FORMAT;
    }

    const format = `${value}`.trim().toLowerCase();
    if (SUPPORTED_FORMATS.includes(format as OutputFormat)) {
      return format as OutputFormat;
    }

    throw new Error(
      `The "output" option must be one of: ${SUPPORTED_FORMATS.join(
        ", "
      )}, but received "${value}".`
    );
  }

  public static getFormat(): OutputFormat {
    return OutputHelper.format;
  }

  public static isJson(): boolean {
    return OutputHelper.format === "json";
  }

  /**
   * Writes a line to stdout, unless the run reports machine readable output.
   */
  public static log(...args: any[]) {
    if (!OutputHelper.isJson()) {
      console.log(...args);
    }
  }

  /**
   * Writes an informational line to stdout, unless the run reports machine
   * readable output.
   */
  public static info(...args: any[]) {
    if (!OutputHelper.isJson()) {
      console.info(...args);
    }
  }

  /**
   * Reports something the run could not do, but which is not fatal. In JSON
   * mode it is kept for the `warnings` array of the result, so it does not get
   * lost when the human output is silenced.
   * @param message The warning to report.
   */
  public static warning(message: string) {
    if (OutputHelper.isJson()) {
      StatusHelper.addWarning(message);
      return;
    }

    console.info(kleur.bold().bgYellow().black(` Warning: `), message);
  }

  /**
   * Stores the result of the command, to be written by `flush()` at the end of
   * the run. Only used when the run reports machine readable output.
   * @param result The command specific result.
   */
  public static setResult(result: CommandResult | Record<string, unknown>) {
    if (OutputHelper.isJson()) {
      OutputHelper.result = { ...result };
    }
  }

  /**
   * Writes the result of the run as a single JSON document to stdout.
   *
   * Commands which have nothing structured to report still get a document, so
   * `--output json` always produces parsable output.
   * @param defaults The command and version to report when the command did not set them.
   */
  public static flush(defaults: { command: string | null; version: string | null }) {
    if (!OutputHelper.isJson()) {
      return;
    }

    OutputHelper.write({
      command: defaults.command,
      success: true,
      version: defaults.version,
      ...(OutputHelper.result || {}),
    });
  }

  /**
   * Writes a failed run as a JSON document to stdout.
   * @param defaults The command and version of the run.
   * @param message The error message.
   */
  public static flushError(
    defaults: { command: string | null; version: string | null },
    message: string
  ) {
    if (!OutputHelper.isJson()) {
      return;
    }

    const warnings = StatusHelper.getWarnings();

    OutputHelper.write({
      command: defaults.command,
      success: false,
      version: defaults.version,
      ...(warnings.length > 0 ? { warnings } : {}),
      error: { message },
    });
  }

  private static write(result: CommandResult | Record<string, unknown>) {
    // Written once, and only here: a second document would break the parser on
    // the other end.
    OutputHelper.result = null;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
