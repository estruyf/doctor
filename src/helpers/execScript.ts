import { CliCommand } from './CliCommand';
import { exec } from 'child_process';
import { spawn } from 'cross-spawn';
import { Logger } from './logger';

/**
 * Execute script with retry logic
 * @param args 
 * @param shouldRetry 
 * @param shouldSpawn 
 * @param toMask
 */
export const execScript = async <T>(args: string[] = [], shouldRetry: boolean = false, shouldSpawn: boolean = false, toMask: string[] = []): Promise<T> => {
  try {
    return await promiseExecScript<T>(args, shouldSpawn, toMask);
  } catch (err) {
    if (shouldRetry) {
      Logger.debug(`Doctor will retry to execute the command again.`);
      try {
        // Waiting 5 seconds in order to make sure that the call did not happen too fast after the previous failure
        setTimeout(async () => {
          return await promiseExecScript(args, shouldSpawn, toMask);
        }, 5000);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
}


const promiseExecScript = async <T>(args: string[] = [], shouldSpawn: boolean = false, toMask: string[] = []): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    Logger.debug(``);
    const cmdToExec = Logger.mask(`${CliCommand.getName()} ${args.join(' ')}`, toMask);
    Logger.debug(`Command: ${cmdToExec}`);

    if (shouldSpawn) {
      const execution = spawn(CliCommand.getName(), [...args]);

      execution.stdout.on('data', (data) => {
        console.log(`${data}`);
      });

      execution.stdout.on('close', (data: any) => {
        resolve(data);
      });

      execution.stderr.on('data', async (error) => {
        error = Logger.mask(error, toMask);
        reject(new Error(error));
      });
    } else {
      exec(`${CliCommand.getName()} ${args.join(' ')}`, async (err: Error, stdOut: string, stdErr: string) => {
        if (err || stdErr) {
          let error = err && err.message ? err.message : stdErr;
          error = Logger.mask(error, toMask);
          reject(new Error(error));
          return;
        }

        resolve(stdOut as any as T);
      });
    }
  });
}