import * as core from '@actions/core';

import { executeAngularCliSteps } from './execute-angular-cli-steps';
import { isPush } from './utility/context';
import { spawn } from './utility/spawn';

async function run(): Promise<void> {
  if (isPush()) {
    // Get the last commit message.
    // See: https://stackoverflow.com/a/7293026/6178885
    const message = await spawn(
      'git',
      ['log', '-1', '--pretty=%B', '--oneline'],
      {
        cwd: process.cwd(),
      }
    );

    if (message.indexOf('[ci skip]') > -1) {
      core.info(
        'Found "[ci skip]" in last commit message. Aborting build and test run.'
      );
      process.exit(0);
    }
  }

  await executeAngularCliSteps();
}

run();
