import * as core from '@actions/core';

import {
  SkyUxCIPlatformConfig
} from './ci-platform-config';

import {
  spawn
} from './spawn';

/**
 *
 * @param command The SKY UX CLI command to execute.
 * @param args Any command line arguments.
 * @param platformConfigKey The name of the CI platform config to use.
 */
export function runSkyUxCommand(
  command: string,
  args: string[] = [],
  platform = SkyUxCIPlatformConfig.GitHubActions
): Promise<string> {

  core.info(`
=====================================================
> Running SKY UX command: '${command}'
=====================================================
`);

  if (platform === SkyUxCIPlatformConfig.None) {
    // Run `ChromeHeadless` since it comes pre-installed on the CI machine.
    args.push('--headless');
  } else {
    args.push('--platform', platform);
  }

  return spawn('npx', [
    '-p', '@skyux-sdk/cli',
    'skyux', command,
    '--logFormat', 'none',
    ...args
  ]);
}
