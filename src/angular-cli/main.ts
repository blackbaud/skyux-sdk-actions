import core from '@actions/core';

import fs from 'fs-extra';
import path from 'path';

import { npmPublish } from '../npm-publish';
import { PackageMetadata } from '../package-metadata';
import { runLifecycleHook } from '../run-lifecycle-hook';
import { runNgCommand } from '../run-ng-command';
import { tagSkyuxPackages } from '../tag-skyux-packages';
import { isTag } from '../utils';

async function buildLibrary(projectName: string) {
  try {
    await runNgCommand('build', [projectName, '--configuration=production']);
    await runLifecycleHook('hook-after-build-public-library-success');
  } catch (err) {
    console.error('[SKY UX ERROR]:', err);
    core.setFailed('Library build failed.');
    process.exit(1);
  }
}

async function publishLibrary(): Promise<PackageMetadata> {
  return npmPublish();
}

async function coverage(buildId: string, projectName: string) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${buildId}-coverage`);
  try {
    await runLifecycleHook('hook-before-script');
    await runNgCommand('test', [
      projectName,
      '--code-coverage',
      '--karma-config=./node_modules/@skyux-sdk/pipeline-settings/platforms/gh-actions/karma/karma.angular-cli.conf.js',
      '--watch=false',
    ]);
  } catch (err) {
    console.error('[SKY UX ERROR]:', err);
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

export async function executeAngularCliSteps(buildId: string): Promise<void> {
  const angularJson = fs.readJsonSync(path.join(process.cwd(), 'angular.json'));
  const projectName = angularJson.defaultProject;

  await buildLibrary(projectName);

  // Don't run tests for tags.
  if (isTag()) {
    const packageMetadata = await publishLibrary();
    await tagSkyuxPackages(packageMetadata);
  } else {
    await coverage(buildId, projectName);
  }
}
