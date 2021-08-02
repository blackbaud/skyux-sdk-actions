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
      'blackbaud/skyux-sdk-pipeline-settings',
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

  const args: string[] = [];

  switch (platform) {
    case SkyUxCIPlatformConfig.GitHubActions:
      args.push(
        '--karma-config=./node_modules/@skyux-sdk/pipeline-settings/platforms/gh-actions/karma/karma.angular-cli.conf.js'
      );
      break;
    case SkyUxCIPlatformConfig.None:
    default:
      // Run `ChromeHeadless` by default since it comes pre-installed on the CI machine.
      args.push('--browsers=ChromeHeadless');
      break;
  }

  try {
    await runNgCommand('test', [
      projectName,
      '--code-coverage',
      '--watch=false',
      ...args,
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
  const angularJson = fs.readJsonSync(path.join(process.cwd(), 'angular.json'));
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
