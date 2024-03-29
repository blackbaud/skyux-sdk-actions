import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as glob from 'glob';
import * as path from 'path';

import { isTag } from './utility/context';
import { npmPublish } from './utility/npm-publish';
import { PackageMetadata } from './utility/package-metadata';
import { runLifecycleHook } from './utility/run-lifecycle-hook';
import { runNgCommand } from './utility/run-ng-command';
import { spawn } from './utility/spawn';
import { validateDependencies } from './utility/validate-dependencies';

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
      '--no-audit',
      'blackbaud/skyux-sdk-pipeline-settings',
    ]);
  } catch (err) {
    console.error(err);
    core.setFailed('Packages installation failed.');
    process.exit(1);
  }
}

async function buildLibrary(projectName: string) {
  const packageJson = fs.readJsonSync(
    path.join(core.getInput('working-directory'), 'package.json')
  );

  try {
    await runNgCommand('build', [
      `--project=${projectName}`,
      '--configuration=production',
    ]);
    if (packageJson.devDependencies['@skyux-sdk/documentation-schematics']) {
      await runNgCommand('generate', [
        '@skyux-sdk/documentation-schematics:documentation',
      ]);
    } else {
      core.warning(
        'Skip generating "documentation.json" because the npm package "@skyux-sdk/documentation-schematics" is not installed.'
      );
    }
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

async function coverage(projectName: string) {
  core.info(`
=====================================================
> Running Angular CLI command: 'test'
=====================================================
`);

  try {
    await spawn('npx', ['playwright', 'install-deps']);

    const specs = glob.sync(
      path.join(
        process.cwd(),
        core.getInput('working-directory'),
        'projects',
        projectName,
        '**/*.spec.ts'
      ),
      {
        nodir: true,
      }
    );

    if (specs.length === 0) {
      core.warning('Skipping code coverage because spec files were not found.');
      return;
    }

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

    core.exportVariable(
      'SKY_UX_CODE_COVERAGE_BROWSER_SET',
      core.getInput('code-coverage-browser-set')
    );

    await runNgCommand('test', [
      '--karma-config=./node_modules/@skyux-sdk/pipeline-settings/platforms/gh-actions/karma/karma.angular-cli.conf.js',
      '--progress=false',
      `--project=${projectName}`,
      '--source-map',
      '--watch=false',
    ]);

    await runLifecycleHook('hook-after-code-coverage-success');
  } catch (err) {
    console.error(err);
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

export async function executeAngularCliSteps(): Promise<void> {
  const projectName = core.getInput('project');

  if (core.getInput('validate-dependencies') === 'true') {
    validateDependencies(projectName);
  }

  await install();

  await runLifecycleHook('hook-before-script');

  await buildLibrary(projectName);

  // Don't run tests for tags.
  if (isTag()) {
    await publishLibrary(projectName);
  } else {
    await coverage(projectName);
  }
}
