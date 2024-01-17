import { CliCommand } from "./CliCommand";
import { spawn } from "cross-spawn";
import { Logger } from "./logger";
import { defer, StatusHelper } from ".";
import { Deferred } from "@models";
import { execAsync } from "@utils";

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
export const execScript = async <T>(
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
          execScript(args, shouldRetry, shouldSpawn, toMask, deferred);
        }, 5000);
      } else {
        deferred.reject(err);
      }
    });

  return deferred.promise;
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

    if (shouldSpawn) {
      const execution = spawn(CliCommand.getName(), [...args]);

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
      } catch (e) {
        reject(e.message);
      }
    }
  });
};
