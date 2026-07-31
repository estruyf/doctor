import { CliCommand } from "./CliCommand.js";
import crossSpawn from "cross-spawn";
import { createRequire } from "node:module";
import { Logger } from "./Logger.js";
import { defer, StatusHelper } from "./index.js";
import { Deferred } from "@models";
import { execAsync } from "@utils";
import { executeCommand } from "@pnp/cli-microsoft365";

const EXECUTE_COMMAND_TIMEOUT_MS = 120000;
const require = createRequire(import.meta.url);

const knownShorthandOptions: { [key: string]: string } = {
  o: "output",
  f: "folder",
  id: "id",
};

// Catch all the errors coming from command execution
process.on("unhandledRejection", (reason, promise) => {
  Logger.debug(`Unhandled Rejection at: ${reason}`);
});

/**
 * Execute script with retry logic
 * @param args
 * @param shouldRetry
 * @param shouldSpawn
 * @param toMask
 */
export const runCommand = async <T>(
  args: string[] = [],
  shouldRetry: boolean = false,
  shouldSpawn: boolean = false,
  toMask: string[] = [],
  deferred?: Deferred<T>
): Promise<T | any> => {
  let firstRun = false;
  if (!deferred) {
    firstRun = true;
    deferred = defer();
  }

  promiseExecScript<T>(args, shouldSpawn, toMask)
    .then((result) => {
      deferred.resolve(result);
    })
    .catch((err) => {
      if (shouldRetry && firstRun) {
        Logger.debug(`Doctor will retry to execute the command again.`);
        StatusHelper.addRetry();

        // Waiting 5 seconds in order to make sure that the call did not happen too fast after the previous failure
        setTimeout(async () => {
          runCommand(args, shouldRetry, shouldSpawn, toMask, deferred);
        }, 5000);
      } else {
        deferred.reject(err);
      }
    });

  return deferred.promise;
};

export const executeWithRetry = async (
  commandName: string,
  options: any,
  shouldRetry: boolean
) => {
  try {
    Logger.debug(
      `Executing command: ${commandName} with options: ${JSON.stringify(options)}`
    );

    const result = await executeThroughCliWithTimeout(commandName, options);
    Logger.debug(
      `Command completed: ${commandName}. stdout length: ${
        result?.stdout?.length || 0
      }, stderr length: ${result?.stderr?.length || 0}`
    );
    return result;
  } catch (e) {
    if (shouldRetry) {
      Logger.debug(`Doctor will retry to execute the command again.`);
      StatusHelper.addRetry();
      await new Promise((resolve) => setTimeout(resolve, 5000));

      return await executeThroughCliWithTimeout(commandName, options);
    }
    throw e;
  }
};

const executeThroughCliWithTimeout = async (
  commandName: string,
  options: any
) => {
  const commandParts = commandName.split(" ").filter(Boolean);
  const optionArgs = serializeOptionsToArgv(options);
  const fullArgs = [...commandParts, ...optionArgs];
  const invocation = resolveCliInvocation(CliCommand.getName(), fullArgs);

  Logger.debug(
    `CLI exec: ${invocation.command} ${invocation.args
      .map((arg) => (arg.indexOf(" ") !== -1 ? `"${arg}"` : arg))
      .join(" ")}`
  );

  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = crossSpawn(invocation.command, invocation.args, {
      env: {
        ...process.env,
        CLIMICROSOFT365_NOUPDATE: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    let didTimeout = false;
    let isSettled = false;

    const timeout = setTimeout(() => {
      didTimeout = true;
      child.kill("SIGTERM");
      reject(
        new Error(`Command timed out after ${EXECUTE_COMMAND_TIMEOUT_MS}ms`)
      );
    }, EXECUTE_COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (data) => {
      stdout += `${data}`;
    });

    child.stderr.on("data", (data) => {
      stderr += `${data}`;
    });

    child.on("error", (error) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      clearTimeout(timeout);
      reject(error);
    });

    // Resolve on process exit so we don't hang waiting for stream close.
    child.on("exit", (code) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      clearTimeout(timeout);

      if (didTimeout) {
        return;
      }

      if (code && code !== 0) {
        reject(new Error(stderr || stdout || `Command exited with code ${code}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
};

const resolveCliInvocation = (
  baseCommand: string,
  args: string[]
): { command: string; args: string[] } => {
  const normalized = (baseCommand || "").toLowerCase();

  if (normalized === "m365" || normalized === "localm365") {
    try {
      const cliEntrypoint = require.resolve(
        "@pnp/cli-microsoft365/dist/index.js"
      );

      return {
        command: process.execPath,
        args: [cliEntrypoint, ...args],
      };
    } catch {
      // Fallback to direct command execution if package resolution fails.
      return {
        command: baseCommand,
        args,
      };
    }
  }

  return {
    command: baseCommand,
    args,
  };
};

const serializeOptionsToArgv = (options: any): string[] => {
  if (!options || typeof options !== "object") {
    return [];
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "undefined" || value === null || value === false) {
      continue;
    }

    parts.push(`--${key}`);

    if (value === true) {
      continue;
    }

    parts.push(`${value}`);
  }

  return parts;
};

const promiseExecScript = async <T>(
  args: string[] = [],
  shouldSpawn: boolean = false,
  toMask: string[] = []
): Promise<T> => {
  return new Promise<T>(async (resolve, reject) => {
    Logger.debug(``);
    const cmdToExec = Logger.mask(
      `${CliCommand.getName()} ${args.join(" ")}`,
      toMask
    );
    Logger.debug(`Command: ${cmdToExec}`);

    if (usesM365Api(CliCommand.getName())) {
      try {
        const parsed = parseM365CommandArgs(args);

        const listener = shouldSpawn
          ? {
              stdout: (message: any) => {
                console.log(`${message}`);
              },
              stderr: (message: any) => {
                console.error(`${Logger.mask(`${message}`, toMask)}`);
              },
            }
          : undefined;

        const result = await executeCommand(
          parsed.commandName,
          parsed.options,
          listener
        );

        if (result.stderr) {
          reject(new Error(Logger.mask(result.stderr, toMask)));
          return;
        }

        resolve(result.stdout as any as T);
        return;
      } catch (error: any) {
        const message = getCommandErrorMessage(error);
        reject(new Error(Logger.mask(message, toMask)));
        return;
      }
    }

    if (shouldSpawn) {
      const execution = crossSpawn(CliCommand.getName(), [...args]);

      execution.stdout.on("data", (data) => {
        console.log(`${data}`);
      });

      execution.stdout.on("close", (data: any) => {
        resolve(data);
      });

      execution.stderr.on("data", async (error) => {
        error = Logger.mask(error, toMask);
        reject(new Error(error));
      });
    } else {
      try {
        const { stdout, stderr } = await execAsync(
          `${CliCommand.getName()} ${args.join(" ")}`
        );
        if (stderr) {
          const error = Logger.mask(stderr, toMask);
          reject(new Error(error));
          return;
        }

        resolve(stdout as any as T);
      } catch (e: any) {
        reject(e.message);
      }
    }
  });
};

const usesM365Api = (commandName: string): boolean => {
  return ["m365", "localm365"].indexOf(commandName.toLowerCase()) !== -1;
};

const parseM365CommandArgs = (args: string[]): {
  commandName: string;
  options: any;
} => {
  const optionStartIndex = args.findIndex((arg) => arg.startsWith("-"));
  const commandTokens =
    optionStartIndex === -1 ? args : args.slice(0, optionStartIndex);
  const commandName = commandTokens.join(" ").trim();

  if (!commandName) {
    throw new Error("No command specified.");
  }

  const optionTokens =
    optionStartIndex === -1 ? [] : args.slice(optionStartIndex);
  const options: any = {};

  for (let i = 0; i < optionTokens.length; i++) {
    const token = optionTokens[i];

    if (!token.startsWith("-")) {
      continue;
    }

    const rawKey = token.replace(/^-+/, "");
    const optionKey =
      knownShorthandOptions[rawKey] ||
      knownShorthandOptions[rawKey[0]] ||
      rawKey;

    const nextToken = optionTokens[i + 1];
    const hasValue = !!nextToken && !nextToken.startsWith("-");

    options[optionKey] = hasValue ? nextToken : true;

    if (hasValue) {
      i += 1;
    }
  }

  return {
    commandName,
    options,
  };
};

const getCommandErrorMessage = (error: any): string => {
  if (!error) {
    return "Unknown command error.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.error && error.error.message) {
    return error.error.message;
  }

  if (error.stderr) {
    return error.stderr;
  }

  if (error.message) {
    return error.message;
  }

  return JSON.stringify(error);
};
