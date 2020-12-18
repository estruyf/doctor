import { exec } from 'child_process';
import { spawn } from 'cross-spawn';
import { Logger } from './logger';

export const execScript = async <T>(command: string, args: string[] = [], shouldSpawn: boolean = false): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    Logger.debug(`Command: ${command} ${args.join(' ')}`);
    
    if (shouldSpawn) {
      const execution = spawn(command, [...args]);

      execution.stdout.on('data', (data) => {
        console.log(`${data}`);
      });

      execution.stdout.on('close', (data: any) => {
        resolve(data);
      });

      execution.stderr.on('data', (error) => {
        reject(error);
      });
    } else {
        exec(`${command} ${args.join(' ')}`, (err: Error, stdOut: string, stdErr: string) => {
        if (err || stdErr) {
          reject(err || stdErr);
          return;
        }

        resolve(stdOut as any as T);
      });
    }
  });
}