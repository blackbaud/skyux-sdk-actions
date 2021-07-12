import * as core from '@actions/core';

import * as child_process from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

import { cloneRepoAsAdmin } from './clone-repo-as-admin';
import { PackageMetadata } from './package-metadata';
import { spawn } from './spawn';

const REPO_TEMP_DIR = '.skyuxpackagestemp';
const REPO_BRANCH = 'master';

function updatePackageJson(workingDirectory: string): string {
  const packageJsonPath = path.join(workingDirectory, 'package.json');
  const packageJson = fs.readJsonSync(packageJsonPath);

  const releaseType = (packageJson.version as string).includes('-')
    ? 'prerelease'
    : 'patch';

  const newVersion = semver.inc(packageJson.version, releaseType) as string;

  packageJson.version = newVersion;

  fs.writeJsonSync(packageJsonPath, packageJson);

  return newVersion;
}

function updateChangelog(
  workingDirectory: string,
  newVersion: string,
  packageMetadata: PackageMetadata
): void {
  const changelogPath = path.join(workingDirectory, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath).toString();

  const date = new Date().toLocaleString().split(', ')[0];

  const contents = `# ${newVersion} (${date})

- \`${packageMetadata.name}@${packageMetadata.version}\` [Release notes](${packageMetadata.changelogUrl})

${changelog}`;

  fs.writeFileSync(changelogPath, contents, { encoding: 'utf-8' });
}

export async function tagSkyuxPackages(
  packageMetadata: PackageMetadata
): Promise<void> {
  const accessToken = core.getInput('github-token');
  const workingDirectory = path.join(
    core.getInput('working-directory'),
    REPO_TEMP_DIR
  );

  const repoUrl = `https://${accessToken}@github.com/skyux-packages.git`;

  // Clone blackbaud/skyux-packages repo as admin user.
  await cloneRepoAsAdmin(repoUrl, REPO_BRANCH, REPO_TEMP_DIR);

  const spawnConfig: child_process.SpawnOptions = {
    cwd: workingDirectory,
    stdio: 'inherit',
  };

  // Update the CHANGELOG and package.json with a patch/minor version.
  const newVersion = updatePackageJson(workingDirectory);
  updateChangelog(workingDirectory, newVersion, packageMetadata);

  // Commit directly to master branch.
  await spawn('git', ['add', '.'], spawnConfig);

  await spawn(
    'git',
    [
      'commit',
      '-m',
      `Updated changelog/package.json for ${newVersion} release`,
    ],
    spawnConfig
  );

  await spawn('git', ['push', 'origin', REPO_BRANCH], spawnConfig);

  // Tag the commit and push to origin.
  await spawn('git', ['tag', newVersion], spawnConfig);
  await spawn('git', ['push', 'origin', newVersion], spawnConfig);
}
