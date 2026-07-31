import { CliCommand } from "./CliCommand.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { Logger } from "./Logger.js";
import { StatusHelper } from "./index.js";

const EXECUTE_COMMAND_TIMEOUT_MS = 120000;
const require = createRequire(import.meta.url);

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
    const child = spawn(invocation.command, invocation.args, {
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

    child.stdout?.on("data", (data) => {
      stdout += `${data}`;
    });

    child.stderr?.on("data", (data) => {
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
