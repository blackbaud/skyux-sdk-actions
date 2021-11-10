import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

import {
  checkNewBaselineScreenshots,
  checkNewFailureScreenshots,
} from '../screenshot-comparator';
import { spawn } from '../spawn';
import { isPullRequest, isPush } from '../utils';

import { updateChromeDriver } from './chromedriver-manager';

export async function visual(
  buildId: string,
  projectName: string,
  angularJson: any
): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY!;
  const projectDefinition = angularJson.projects[projectName];

  try {
    if (!projectDefinition) {
      core.warning(
        `Skipping visual tests because a project named "${projectName}" was not found in the workspace configuration.`
      );
      return;
    }

    const projectRoot = path.join(
      core.getInput('working-directory'),
      projectDefinition.root
    );

    const e2ePath = path.join(projectRoot, 'e2e');

    if (!fs.existsSync(e2ePath)) {
      core.warning(`Skipping visual tests because "${e2ePath}" was not found.`);
      return;
    }

    core.info(`
=====================================================
> Running Angular CLI command: 'e2e'
=====================================================
`);

    await updateChromeDriver();

    const args = [
      path.join(
        './node_modules/@skyux-sdk/pipeline-settings/test-runners/protractor.js'
      ),
      '--platform=gh-actions',
      `--project-name=${projectName}`,
      `--project-root=${projectRoot}`,
    ];

    await spawn('node', args);

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
