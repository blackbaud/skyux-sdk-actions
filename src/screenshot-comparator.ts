import * as core from '@actions/core';

import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as rimraf from 'rimraf';

import { cloneRepoAsAdmin } from './clone-repo-as-admin';
import { directoryHasChanges } from './directory-has-changes';
import { spawn } from './spawn';

const BASELINE_SCREENSHOT_DIR = 'screenshots-baseline';
const FAILURE_SCREENSHOT_DIR = 'screenshots-diff';
const TEMP_DIR = '.skypagesvisualbaselinetemp';

async function commitBaselineScreenshots(repository: string, buildId: string) {
  const branch = core.getInput('visual-baselines-branch') || 'master';
  const accessToken = core.getInput('github-token');
  const workingDirectory = core.getInput('working-directory');
  const repoUrl = `https://${accessToken}@github.com/${repository}.git`;

  await cloneRepoAsAdmin(repoUrl, branch, TEMP_DIR);

  // Move new screenshots to fresh copy of the repo.
  await fs.copy(
    path.resolve(workingDirectory, BASELINE_SCREENSHOT_DIR),
    path.resolve(workingDirectory, TEMP_DIR, BASELINE_SCREENSHOT_DIR)
  );

  core.info(
    `Preparing to commit baseline screenshots to the '${branch}' branch.`
  );

  const config: child_process.SpawnOptions = {
    cwd: path.resolve(workingDirectory, TEMP_DIR),
    stdio: 'inherit',
  };

  await spawn('git', ['checkout', branch], config);
  await spawn('git', ['add', BASELINE_SCREENSHOT_DIR], config);
  await spawn(
    'git',
    [
      'commit',
      '--message',
      `Build #${buildId}: Added new baseline screenshots. [ci skip]`,
    ],
    config
  );

  await spawn('git', ['push', '--force', 'origin', branch], config);

  core.info('New baseline images saved.');
}

async function commitFailureScreenshots(buildId: string) {
  const branch = buildId;
  const accessToken = core.getInput('github-token');
  const workingDirectory = core.getInput('working-directory');
  const repoUrl = `https://${accessToken}@github.com/blackbaud/skyux-visual-test-results.git`;

  await cloneRepoAsAdmin(repoUrl, 'master', TEMP_DIR);

  // Move new screenshots to fresh copy of the repo.
  await fs.copy(
    path.resolve(workingDirectory, FAILURE_SCREENSHOT_DIR),
    path.resolve(workingDirectory, TEMP_DIR, FAILURE_SCREENSHOT_DIR)
  );

  core.info(
    `Preparing to commit failure screenshots to the '${branch}' branch.`
  );

  const config = {
    cwd: path.resolve(workingDirectory, TEMP_DIR),
  };

  await spawn('git', ['checkout', '-b', branch], config);
  await spawn('git', ['add', FAILURE_SCREENSHOT_DIR], config);
  await spawn(
    'git',
    [
      'commit',
      '--message',
      `Build #${buildId}: Added new failure screenshots. [ci skip]`,
    ],
    config
  );
  await spawn('git', ['push', '--force', '--quiet', 'origin', branch], config);

  const url = repoUrl.split('@')[1].replace('.git', '');

  core.setFailed(
    `SKY UX visual test failure!\nScreenshots may be viewed at: https://${url}/tree/${branch}`
  );
  process.exit(1);
}

/**
 *
 * @param repository The repo to commit screenshots to: ${org}/${repo}
 * @param buildId The CI build identifier.
 */
export async function checkNewBaselineScreenshots(
  repository: string,
  buildId: string
): Promise<void> {
  const hasChanges = await directoryHasChanges(BASELINE_SCREENSHOT_DIR);
  if (hasChanges) {
    core.info('New screenshots detected.');
    await commitBaselineScreenshots(repository, buildId);
  } else {
    core.info('No new screenshots detected. Done.');
  }

  rimraf.sync(TEMP_DIR);
}

/**
 *
 * @param buildId The CI build identifier.
 */
export async function checkNewFailureScreenshots(
  buildId: string
): Promise<void> {
  const hasChanges = await directoryHasChanges(FAILURE_SCREENSHOT_DIR);
  if (hasChanges) {
    core.info('New screenshots detected.');
    await commitFailureScreenshots(buildId);
  } else {
    core.info('No new screenshots detected. Done.');
  }

  rimraf.sync(TEMP_DIR);
}
