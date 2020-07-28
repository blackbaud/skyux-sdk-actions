import * as core from '@actions/core';
import * as fs from 'fs-extra';
import * as path from 'path';

import {
  runSkyUxCommand
} from './run-skyux-command';

import {
  checkNewBaselineScreenshots,
  checkNewFailureScreenshots
} from './screenshot-comparator';

import {
  spawn
} from './spawn';

import {
  isPush
} from './utils';

async function coverage(buildId: string) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${buildId}-coverage`);

  try {
    await runSkyUxCommand('test', ['--coverage', 'library']);
  } catch (err) {
    core.setFailed('Code coverage failed.');
  }
}

async function visual(buildId: string) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${buildId}-visual`);

  const repository = process.env.GITHUB_REPOSITORY || '';
  try {
    await runSkyUxCommand('e2e');
    if (isPush()) {
      await checkNewBaselineScreenshots(repository, buildId);
    }
  } catch (err) {
    if (isPush()) {
      await checkNewFailureScreenshots(buildId);
    }
    core.setFailed('End-to-end tests failed.');
  }
}

async function buildLibrary() {
  try {
    await runSkyUxCommand('build-public-library');
  } catch (err) {
    core.setFailed('Library build failed.');
  }
}

function getPackageJsonContents() {
  const rootPath = path.join(process.cwd(), core.getInput('working-directory'));
  const packageJsonPath = path.join(rootPath, 'package.json');
  return fs.readJson(packageJsonPath);
}

function runPackageScript(scriptName: string) {
  core.info(`
=================================================================
> Custom script found. Running \`npm run ${scriptName}\`...
=================================================================
`);
  return spawn('npm', ['run', scriptName]);
}

export async function runTestSuite(buildId: string) {
  const packageJson = await getPackageJsonContents();
  const hasCustomTestCommand = (packageJson.scripts['test:ci'] !== undefined);
  const hasCustomBuildLibraryCommand = (packageJson.scripts['build-public-library:ci'] !== undefined);
  const hasCustomE2ECommand = (packageJson.scripts['e2e:ci'] !== undefined);

  if (hasCustomTestCommand) {
    await runPackageScript('test:ci');
  } else {
    await coverage(buildId);
  }

  if (hasCustomE2ECommand) {
    await runPackageScript('e2e:ci');
  } else {
    await visual(buildId);
  }

  if (hasCustomBuildLibraryCommand) {
    await runPackageScript('build-public-library:ci');
  } else {
    await buildLibrary();
  }
}
