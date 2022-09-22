import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as glob from 'glob';
import * as path from 'path';

import { npmPublish } from '../npm-publish';
import { PackageMetadata } from '../package-metadata';
import { runLifecycleHook } from '../run-lifecycle-hook';
import { runNgCommand } from '../run-ng-command';
import { spawn } from '../spawn';
import { tagSkyuxPackages } from '../tag-skyux-packages';
import { isTag } from '../utils';

import { validateDependencies } from './validate-dependencies';

// import { visual } from './visual';

// function getBrowserStackCliArguments(buildId: string): string[] {
//   return [
//     `--browserstack-username=${core.getInput('browser-stack-username')}`,
//     `--browserstack-access-key=${core.getInput('browser-stack-access-key')}`,
//     `--browserstack-build-id=${buildId}`,
//     `--browserstack-project=${
//       core.getInput('browser-stack-project') || process.env.GITHUB_REPOSITORY
//     }`,
//   ];
// }

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
      'blackbaud/skyux-sdk-pipeline-settings#update-dependencies',
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

async function coverage(buildId: string, projectName: string) {
  core.info(`
=====================================================
> Running Angular CLI command: 'test'
=====================================================
`);

  try {
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

    process.env.SKY_UX_CODE_COVERAGE_THRESHOLD_BRANCHES = core.getInput(
      'code-coverage-threshold-branches'
    );

    process.env.SKY_UX_CODE_COVERAGE_THRESHOLD_FUNCTIONS = core.getInput(
      'code-coverage-threshold-functions'
    );

    process.env.SKY_UX_CODE_COVERAGE_THRESHOLD_LINES = core.getInput(
      'code-coverage-threshold-lines'
    );

    process.env.SKY_UX_CODE_COVERAGE_THRESHOLD_STATEMENTS = core.getInput(
      'code-coverage-threshold-statements'
    );

    process.env.SKY_UX_CODE_COVERAGE_BROWSER_SET = core.getInput(
      'code-coverage-browser-set'
    );

    await runNgCommand('test', [
      `--project=${projectName}`,
      '--watch=false',
      '--source-map=false',
      '--progress=false',
      '--karma-config=./node_modules/@skyux-sdk/pipeline-settings/platforms/gh-actions/karma/karma.angular-cli.conf.js',
    ]);

    await runLifecycleHook('hook-after-code-coverage-success');
  } catch (err) {
    console.error(err);
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

// Since we've migrated to the monorepo, exclude the following projects from executing this action.
// const EXCLUDE_PROJECTS = [
//   'a11y',
//   'action-bars',
//   'ag-grid',
//   'angular-tree-component',
//   'animations',
//   'assets',
//   'autonumeric',
//   'avatar',
//   'colorpicker',
//   'config',
//   'core',
//   'data-manager',
//   'datetime',
//   'errors',
//   'flyout',
//   'forms',
//   'grids',
//   'http',
//   'i18n',
//   'indicators',
//   'inline-form',
//   'layout',
//   'list-builder',
//   'list-builder-common',
//   'list-builder-view-checklist',
//   'list-builder-view-grids',
//   'lists',
//   'lookup',
//   'modals',
//   'navbar',
//   'omnibar-interop',
//   'pages',
//   'phone-field',
//   'popovers',
//   'progress-indicator',
//   'router',
//   'select-field',
//   'split-view',
//   'tabs',
//   'text-editor',
//   'theme',
//   'tiles',
//   'toast',
//   'validation',
// ];

export async function executeAngularCliSteps(buildId: string): Promise<void> {
  const projectName = core.getInput('project');

  if (core.getInput('validate-dependencies') === 'true') {
    validateDependencies(projectName);
  }

  await install();

  await runLifecycleHook('hook-before-script');

  await buildLibrary(projectName);

  // Don't run tests for tags.
  if (isTag()) {
    const packageMetadata = await publishLibrary(projectName);
    await tagSkyuxPackages(packageMetadata);
  } else {
    await coverage(buildId, projectName);

    // Disabling visual tests until we can replace Protractor with Cypress.
    // await visual(buildId, `${projectName}-showcase`, angularJson);
  }
}
