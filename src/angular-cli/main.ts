import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

import { npmPublish } from '../npm-publish';
import { PackageMetadata } from '../package-metadata';
import { runLifecycleHook } from '../run-lifecycle-hook';
import { runNgCommand } from '../run-ng-command';
import {
  checkNewBaselineScreenshots,
  checkNewFailureScreenshots,
} from '../screenshot-comparator';
import { spawn } from '../spawn';
import { tagSkyuxPackages } from '../tag-skyux-packages';
import { isPullRequest, isPush, isTag } from '../utils';

function getBrowserStackCliArguments(buildId: string): string[] {
  return [
    `--browserstack-username=${core.getInput('browser-stack-username')}`,
    `--browserstack-access-key=${core.getInput('browser-stack-access-key')}`,
    `--browserstack-build-id=${buildId}`,
    `--browserstack-project=${
      core.getInput('browser-stack-project') || process.env.GITHUB_REPOSITORY
    }`,
  ];
}

async function install(): Promise<void> {
  try {
    const packageLock = path.join(
      process.cwd(),
      core.getInput('working-directory'),
      'package-lock.json'
    );

    if (fs.existsSync(packageLock)) {
      await spawn('npm', ['ci']);
    } else {
      await spawn('npm', ['install']);
    }

    await spawn('npm', [
      'install',
      '--no-save',
      'blackbaud/skyux-sdk-pipeline-settings#angular-cli-support',
    ]);
  } catch (err) {
    console.error(err);
    core.setFailed('Packages installation failed.');
    process.exit(1);
  }
}

async function buildLibrary(projectName: string) {
  try {
    await runNgCommand('build', [projectName, '--configuration=production']);
    await runLifecycleHook('hook-after-build-public-library-success');
  } catch (err) {
    console.error(err);
    core.setFailed('Library build failed.');
    process.exit(1);
  }
}

async function publishLibrary(projectName: string): Promise<PackageMetadata> {
  const distPath = path.join(
    process.cwd(),
    core.getInput('working-directory'),
    'dist',
    projectName
  );
  return npmPublish(distPath);
}

async function coverage(buildId: string, projectName: string) {
  try {
    await spawn('node', [
      './node_modules/@skyux-sdk/pipeline-settings/test-runners/karma.js',
      '--platform=gh-actions',
      `--project-name=${projectName}`,
      ...getBrowserStackCliArguments(`${buildId}-coverage`),
      `--code-coverage-browser-set=${core.getInput(
        'code-coverage-browser-set'
      )}`,
      `--code-coverage-threshold-branches=${core.getInput(
        'code-coverage-threshold-branches'
      )}`,
      `--code-coverage-threshold-functions=${core.getInput(
        'code-coverage-threshold-functions'
      )}`,
      `--code-coverage-threshold-lines=${core.getInput(
        'code-coverage-threshold-lines'
      )}`,
      `--code-coverage-threshold-statements=${core.getInput(
        'code-coverage-threshold-branches'
      )}`,
    ]);

    await runLifecycleHook('hook-after-code-coverage-success');
  } catch (err) {
    console.error(err);
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

async function visual(buildId: string, projectName: string) {
  const repository = process.env.GITHUB_REPOSITORY || '';

  const angularJson = fs.readJsonSync(
    path.join(process.cwd(), core.getInput('working-directory'), 'angular.json')
  );

  const projectRoot = path.join(
    core.getInput('working-directory'),
    angularJson?.projects[projectName]?.root || ''
  );

  try {
    await spawn('node', [
      './node_modules/@skyux-sdk/pipeline-settings/test-runners/protractor.js',
      '--platform=gh-actions',
      `--project-name=${projectName}`,
      `--project-root=${projectRoot}`,
      ...getBrowserStackCliArguments(`${buildId}-visual`),
    ]);

    if (isPush()) {
      await checkNewBaselineScreenshots(repository, buildId);
    }
  } catch (err) {
    if (isPullRequest()) {
      await checkNewFailureScreenshots(buildId);
    }

    console.error('[SKY UX ERROR]:', err);
    core.setFailed('End-to-end tests failed.');
    process.exit(1);
  }
}

export async function executeAngularCliSteps(buildId: string): Promise<void> {
  const angularJson = fs.readJsonSync(
    path.join(process.cwd(), core.getInput('working-directory'), 'angular.json')
  );

  const projectName = angularJson.defaultProject;

  await install();

  await runLifecycleHook('hook-before-script');

  await buildLibrary(projectName);

  // Don't run tests for tags.
  if (isTag()) {
    const packageMetadata = await publishLibrary(projectName);
    await tagSkyuxPackages(packageMetadata);
  } else {
    await coverage(buildId, projectName);
    await visual(buildId, projectName);
  }
}
