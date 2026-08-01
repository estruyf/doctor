import { CliCommand } from "./CliCommand.js";
import { spawn } from "node:child_process";
import { executeCommand } from "@pnp/cli-microsoft365";
import { access, readFile } from "node:fs/promises";
import { Logger } from "./Logger.js";
import { StatusHelper } from "./StatusHelper.js";

const EXECUTE_COMMAND_TIMEOUT_MS = 120000;

const toErrorMessage = (error: any): string => {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  const candidates = [
    error?.error?.message,
    error?.stderr,
    error?.stdout,
    error?.message,
  ];

  const isObjectPlaceholder = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "[object object]" ||
      normalized === "error: [object object]" ||
      normalized.endsWith(": [object object]")
    );
  };

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0 &&
      !isObjectPlaceholder(candidate)
    ) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      try {
        return JSON.stringify(candidate);
      } catch {
        // Ignore and continue
      }
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return `${error}`;
  }
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

      try {
        return await executeThroughCliWithTimeout(commandName, options);
      } catch (retryError) {
        throw new Error(
          `Command failed: ${commandName}. ${toErrorMessage(retryError)}`
        );
      }
    }
    throw new Error(`Command failed: ${commandName}. ${toErrorMessage(e)}`);
  }
};

const executeThroughCliWithTimeout = async (
  commandName: string,
  options: any
) => {
  const normalized = (CliCommand.getName() || "").toLowerCase();
  if (normalized === "m365" || normalized === "localm365") {
    return await executeM365WithTimeout(commandName, options);
  }

  const commandParts = commandName.split(" ").filter(Boolean);
  const optionArgs = serializeOptionsToArgv(options);
  const fullArgs = [...commandParts, ...optionArgs];
  const invocation = {
    command: CliCommand.getName(),
    args: fullArgs,
  };

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
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;

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

    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });

    // Use "close" to ensure stdout/stderr streams are fully flushed.
    child.on("close", () => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      clearTimeout(timeout);

      if (didTimeout) {
        return;
      }

      if (exitCode && exitCode !== 0) {
        const stderrText = stderr?.trim();
        const stdoutText = stdout?.trim();
        const isPlaceholder = (value: string): boolean => {
          const normalized = value.trim().toLowerCase();
          return (
            normalized === "[object object]" ||
            normalized === "error: [object object]" ||
            normalized.endsWith(": [object object]")
          );
        };

        const message =
          (stderrText && !isPlaceholder(stderrText) ? stderrText : "") ||
          (stdoutText && !isPlaceholder(stdoutText) ? stdoutText : "") ||
          `Command exited with code ${exitCode}`;
        reject(new Error(message));
        return;
      }

      if (exitSignal) {
        reject(new Error(`Command terminated by signal ${exitSignal}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
};

const executeM365WithTimeout = async (
  commandName: string,
  options: any
): Promise<{ stdout: string; stderr: string }> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Command timed out after ${EXECUTE_COMMAND_TIMEOUT_MS}ms`));
    }, EXECUTE_COMMAND_TIMEOUT_MS);
  });

  const commandPromise = (async () => {
    const normalizedOptions = await resolveFileOptionReferences(options);
    const result = await executeCommand(commandName, normalizedOptions);
    const stdout = result?.stdout ? `${result.stdout}` : "";
    const stderr = result?.stderr ? `${result.stderr}` : "";

    if (stderr.trim().length > 0) {
      throw new Error(stderr);
    }

    return { stdout, stderr };
  })();

  return await Promise.race([commandPromise, timeoutPromise]);
};

const resolveFileOptionReferences = async (options: any): Promise<any> => {
  if (!options || typeof options !== "object") {
    return options;
  }

  const normalized: Record<string, any> = { ...options };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value !== "string" || !value.startsWith("@")) {
      continue;
    }

    const filePath = value.slice(1);
    if (!filePath) {
      continue;
    }

    try {
      await access(filePath);
      normalized[key] = await readFile(filePath, { encoding: "utf-8" });
    } catch {
      // Keep original value when it's not a local file reference.
      normalized[key] = value;
    }
  }

  return normalized;
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
