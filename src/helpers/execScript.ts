import { CliCommand } from './CliCommand';
import { exec } from 'child_process';
import { spawn } from 'cross-spawn';
import { Logger } from './logger';

/**
 * Execute script with retry logic
 * @param args 
 * @param shouldSpawn 
 * @param toMask 
 * @param retry 
 */
export const execScript = async <T>(args: string[] = [], shouldSpawn: boolean = false, toMask: string[] = [], retry: boolean = false): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    Logger.debug(``);
    const cmdToExec = Logger.mask(`${CliCommand.getName()} ${args.join(' ')}`, toMask);
    Logger.debug(`Command: ${cmdToExec}${retry ? ` - command failed and will be executed again` : ""}`);

    if (shouldSpawn) {
      const execution = spawn(CliCommand.getName(), [...args]);

      execution.stdout.on('data', (data) => {
        console.log(`${data}`);
      });

      execution.stdout.on('close', (data: any) => {
        resolve(data);
      });

      execution.stderr.on('data', (error) => {
        error = Logger.mask(error, toMask);

        if (CliCommand.getRetry() && !retry) {
          retry = true;
          return execScript(args, shouldSpawn, toMask, retry);
        }

        reject(new Error(error));
      });
    } else {
        exec(`${CliCommand.getName()} ${args.join(' ')}`, (err: Error, stdOut: string, stdErr: string) => {
        if (err || stdErr) {
          let error = err && err.message ? err.message : stdErr;
          error = Logger.mask(error, toMask);

          if (CliCommand.getRetry() && !retry) {
            retry = true;
            return execScript(args, shouldSpawn, toMask, retry);
          }

          reject(new Error(error));
          return;
        }

        resolve(stdOut as any as T);
      });
    }
  });
}