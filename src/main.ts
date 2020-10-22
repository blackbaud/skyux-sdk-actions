import * as core from '@actions/core';
import * as path from 'path';

import {
  npmPublish
} from './npm-publish';

import {
  checkNewBaselineScreenshots,
  checkNewFailureScreenshots
} from './screenshot-comparator';

import {
  spawn
} from './spawn';

import {
  isPullRequest,
  isPush,
  isTag
} from './utils';

/**
 * A unique key used by SKY UX Builder to locate a configuration file.
 * @see https://github.com/blackbaud/skyux-sdk-builder/blob/master/cli/utils/config-resolver.js#L39-L44
 */
const enum SkyUxCIPlatformConfig {
  GitHubActions = 'gh-actions',
  None = 'none'
}

// Generate a unique build name to be used by BrowserStack.
const BUILD_ID = `${process.env.GITHUB_REPOSITORY?.split('/')[1]}-${process.env.GITHUB_EVENT_NAME}-${process.env.GITHUB_RUN_ID}-${Math.random().toString().slice(2,7)}`;

/**
 *
 * @param command The SKY UX CLI command to execute.
 * @param args Any command line arguments.
 * @param platformConfigKey The name of the CI platform config to use.
 */
function runSkyUxCommand(
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
    args.push(
      '--headless'
    );
  } else {
    args.concat([
      '--platform', platform
    ]);
  }

  return spawn('npx', [
    '-p', '@skyux-sdk/cli',
    'skyux', command,
    '--logFormat', 'none',
    ...args
  ]);
}

/**
 * Runs lifecycle hook Node.js scripts. The script must export an async function named `runAsync`.
 * @example
 * ```
 * module.exports = {
 *   runAsync: async () => {}
 * };
 * ```
 * @param name The name of the lifecycle hook to call. See the `action.yml` file at the project root for possible options.
 */
async function runLifecycleHook(name: string) {
  const scriptPath = core.getInput(name);
  if (scriptPath) {
    const basePath = path.join(process.cwd(), core.getInput('working-directory'));
    const fullPath = path.join(basePath, scriptPath);
    core.info(`Running '${name}' lifecycle hook: ${fullPath}`);
    const script = require(fullPath);
    await script.runAsync();
    core.info(`Lifecycle hook '${name}' successfully executed.`);
  }
}

async function installCerts(): Promise<void> {
  try {
    await runSkyUxCommand('certs', ['install']);
  } catch (err) {
    core.setFailed('SSL certificates installation failed.');
    process.exit(1);
  }
}

async function install(): Promise<void> {
  try {
    await spawn('npm', ['ci']);
    await spawn('npm', ['install', '--no-save', '--no-package-lock', 'blackbaud/skyux-sdk-builder-config']);
  } catch (err) {
    core.setFailed('Packages installation failed.');
    process.exit(1);
  }
}

async function build() {
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('build');
  } catch (err) {
    core.setFailed('Build failed.');
    process.exit(1);
  }
}

async function coverage() {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${BUILD_ID}-coverage`);
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('test', ['--coverage', 'library'], SkyUxCIPlatformConfig.None);
  } catch (err) {
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

async function visual() {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${BUILD_ID}-visual`);
  const repository = process.env.GITHUB_REPOSITORY || '';
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('e2e');
    if (isPush()) {
      await checkNewBaselineScreenshots(repository, BUILD_ID);
    }
  } catch (err) {
    if (isPullRequest()) {
      await checkNewFailureScreenshots(BUILD_ID);
    }
    core.setFailed('End-to-end tests failed.');
    process.exit(1);
  }
}

async function buildLibrary() {
  try {
    await runSkyUxCommand('build-public-library');
    await runLifecycleHook('hook-after-build-public-library-success');
  } catch (err) {
    core.setFailed('Library build failed.');
    process.exit(1);
  }
}

async function publishLibrary() {
  npmPublish();
}

/**
 * Get the last commit message.
 * @see https://stackoverflow.com/a/7293026/6178885
 */
function getLastCommitMessage(): Promise<string> {
  return spawn('git', ['log', '-1', '--pretty=%B', '--oneline'], {
    cwd: process.cwd()
  });
}

async function run(): Promise<void> {
  if (isPush()) {

    const message = await getLastCommitMessage();
    if (message.indexOf('[ci skip]') > -1) {
      core.info('Found "[ci skip]" in last commit message. Aborting build and test run.');
      process.exit(0);
    }
  }

  // Set environment variables so that BrowserStack launcher can read them.
  core.exportVariable('BROWSER_STACK_ACCESS_KEY', core.getInput('browser-stack-access-key'));
  core.exportVariable('BROWSER_STACK_USERNAME', core.getInput('browser-stack-username'));
  core.exportVariable('BROWSER_STACK_PROJECT', core.getInput('browser-stack-project') || process.env.GITHUB_REPOSITORY);

  await install();
  await installCerts();

  // Don't run tests for tags.
  if (isTag()) {
    await buildLibrary();
    await publishLibrary();
  } else {
    await build();
    await coverage();
    await visual();
    await buildLibrary();
  }
}

run();
