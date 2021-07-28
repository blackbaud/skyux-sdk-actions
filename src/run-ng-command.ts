import * as core from '@actions/core';

import { SkyUxCIPlatformConfig } from './ci-platform-config';
import { spawn } from './spawn';

/**
 *
 * @param command The Angular CLI command to execute.
 * @param args Any command line arguments.
 * @param platformConfigKey The name of the CI platform config to use.
 */
export function runNgCommand(
  command: string,
  args: string[] = []
): Promise<string> {
  core.info(`
=====================================================
> Running Angular CLI command: '${command}'
=====================================================
`);

  return spawn('npx', ['-p', '@angular/cli', 'ng', command, ...args]);
}
