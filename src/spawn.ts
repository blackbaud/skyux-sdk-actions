import * as core from '@actions/core';
import * as child_process from 'child_process';
import * as path from 'path';

import {
  spawn as crossSpawn
} from 'cross-spawn';

export async function spawn(
  command: string,
  args: string[] = [],
  spawnOptions?: child_process.SpawnOptions
): Promise<string> {

  const defaults: child_process.SpawnOptions = {
    stdio: 'pipe',
    cwd: path.resolve(process.cwd(), core.getInput('working-directory'))
  };

  const childProcess = crossSpawn(command, args, {...defaults, ...spawnOptions});

  return new Promise((resolve, reject) => {

    let output: string = '';
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        if (data) {
          const fragment = data.toString('utf8').trim();
          if (fragment) {
            core.info(fragment);
            output += fragment;
          }
        }
      });
    }

    let errorMessage: string = '';
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        errorMessage += data.toString('utf8');
      });
    }

    childProcess.on('error', (err) => reject(err));

    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(errorMessage);
      }
    });
  });
}