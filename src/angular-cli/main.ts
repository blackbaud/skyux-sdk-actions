import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

import { SkyUxCIPlatformConfig } from '../ci-platform-config';
import { npmPublish } from '../npm-publish';
import { PackageMetadata } from '../package-metadata';
import { runLifecycleHook } from '../run-lifecycle-hook';
import { runNgCommand } from '../run-ng-command';
import { spawn } from '../spawn';
import { tagSkyuxPackages } from '../tag-skyux-packages';
import { isTag } from '../utils';

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

async function coverage(
  buildId: string,
  projectName: string,
  platform: SkyUxCIPlatformConfig
) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${buildId}-coverage`);

  core.exportVariable(
    'SKY_UX_CODE_COVERAGE_BROWSER_SET',
    core.getInput('code-coverage-browser-set')
  );

  core.exportVariable(
    'SKY_UX_CODE_COVERAGE_THRESHOLD_BRANCHES',
    core.getInput('code-coverage-threshold-branches')
  );

  core.exportVariable(
    'SKY_UX_CODE_COVERAGE_THRESHOLD_FUNCTIONS',
    core.getInput('code-coverage-threshold-functions')
  );

  core.exportVariable(
    'SKY_UX_CODE_COVERAGE_THRESHOLD_LINES',
    core.getInput('code-coverage-threshold-lines')
  );

  core.exportVariable(
    'SKY_UX_CODE_COVERAGE_THRESHOLD_STATEMENTS',
    core.getInput('code-coverage-threshold-statements')
  );

  try {
    await spawn('node', [
      './node_modules/@skyux-sdk/pipeline-settings/test-runners/karma.js',
      '--platform=gh-actions',
      `--project-name=${projectName}`,
    ]);

    await runLifecycleHook('hook-after-code-coverage-success');
  } catch (err) {
    console.error(err);
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

export async function executeAngularCliSteps(
  buildId: string,
  platform: SkyUxCIPlatformConfig
): Promise<void> {
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
    await coverage(buildId, projectName, platform);
  }
}
