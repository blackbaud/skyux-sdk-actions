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

// Generate a unique build name to be used by BrowserStack.
const BUILD_ID = `${process.env.GITHUB_REPOSITORY?.split('/')[1]}-${process.env.GITHUB_EVENT_NAME}-${process.env.GITHUB_RUN_ID}-${Math.random().toString().slice(2,7)}`;

function runSkyUxCommand(command: string, args?: string[]): Promise<string> {
  core.info(`
=====================================================
> Running SKY UX command: '${command}'
=====================================================
`);

  return spawn('npx', [
    '-p', '@skyux-sdk/cli',
    'skyux', command,
    '--logFormat', 'none',
    '--platform', 'gh-actions',
    ...args || ''
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
  }
}

async function install(): Promise<void> {
  try {
    await spawn('npm', ['ci']);
    await spawn('npm', ['install', '--no-save', '--no-package-lock', 'blackbaud/skyux-sdk-builder-config']);
  } catch (err) {
    core.setFailed('Packages installation failed.');
  }
}

async function build() {
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('build');
  } catch (err) {
    core.setFailed('Build failed.');
  }
}

async function coverage() {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${BUILD_ID}-coverage`);
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('test', ['--coverage', 'library']);
  } catch (err) {
    core.setFailed('Code coverage failed.');
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
  }
}

async function buildLibrary() {
  try {
    await runLifecycleHook('hook-before-script');
    await runSkyUxCommand('build-public-library');
    await runLifecycleHook('hook-after-build-public-library-success');
  } catch (err) {
    core.setFailed('Library build failed.');
  }
}

async function publishLibrary() {
  npmPublish();
}

async function run(): Promise<void> {
  if (isPush()) {
    // Get the last commit message.
    // See: https://stackoverflow.com/a/7293026/6178885
    const message = await spawn('git', ['log', '-1', '--pretty=%B', '--oneline'], {
      cwd: process.cwd()
    });

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
  await build();

  // Don't run tests for tags.
  if (isTag()) {
    await buildLibrary();
    await publishLibrary();
  } else {
    await coverage();
    await visual();
    await buildLibrary();
  }
}

run();
