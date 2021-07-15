import * as core from '@actions/core';

import * as child_process from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

import { cloneRepoAsAdmin } from './clone-repo-as-admin';
import { PackageMetadata } from './package-metadata';
import { spawn } from './spawn';

const SKYUX_PACKAGES_REPO_TEMP_DIR = '.skyuxpackagestemp';
const SKYUX_PACKAGES_REPO_BRANCH = 'master';

function bumpVersion(version: string): string {
  const releaseType = (version as string).includes('-')
    ? 'prerelease'
    : 'patch';

  const newVersion = semver.inc(version, releaseType) as string;

  return newVersion;
}

function updateChangelog(
  workingDirectory: string,
  newVersion: string,
  libPackage: PackageMetadata
): void {
  const changelogPath = path.join(workingDirectory, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath).toString();

  const date = new Date();

  const contents = `# ${newVersion} (${date.getFullYear()}-${date.getMonth()}-${date.getDate()})

- \`${libPackage.name}@${libPackage.version}\` [Release notes](${
    libPackage.changelogUrl
  })

${changelog}`;

  fs.writeFileSync(changelogPath, contents, { encoding: 'utf-8' });
}

async function commitAndTag(workingDirectory: string, newVersion: string) {
  const spawnConfig: child_process.SpawnOptions = {
    cwd: workingDirectory,
    stdio: 'inherit',
  };

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

  await spawn(
    'git',
    ['push', 'origin', SKYUX_PACKAGES_REPO_BRANCH],
    spawnConfig
  );

  // Tag the commit and push to origin.
  await spawn('git', ['tag', newVersion], spawnConfig);
  await spawn('git', ['push', 'origin', newVersion], spawnConfig);
}

function getMajorVersionBranch(majorVersion: number): string {
  return `${majorVersion}.x.x`;
}

function checkoutMajorVersionBranch(
  workingDirectory: string,
  majorVersion: number
): Promise<string> {
  const spawnConfig: child_process.SpawnOptions = {
    cwd: workingDirectory,
    stdio: 'inherit',
  };

  return spawn(
    'git',
    ['checkout', getMajorVersionBranch(majorVersion)],
    spawnConfig
  );
}

/**
 * After every SKY UX component library release, we also tag the `@skyux/packages` repo,
 * which is used by consumers of the Angular CLI to run `ng update @skyux/packages`.
 * Executing this command will update all component libraries the consumer has
 * installed at once.
 *
 * NOTE: Every release group (major, premajor, prerelease group, etc.) must be initiated manually on the
 * @skyux/packages repo before its version can be automatically bumped by this script.
 * For example, to allow for a new major version of '5.0.0' to be released, we need to manually
 * tag @skyux/packages with '5.0.0' (this would be the same for prerelease versions, '5.0.0-alpha.0' to
 * '5.0.0-beta.0', etc.). This is done so that each release group is made available to our consumers deliberately.
 *
 * @param libPackage Metadata describing the recently released SKY UX component library.
 */
export async function tagSkyuxPackages(
  libPackage: PackageMetadata
): Promise<void> {
  const accessToken = core.getInput('github-token');
  const isDryRun = core.getInput('npm-dry-run') === 'true';

  const workingDirectory = path.join(
    core.getInput('working-directory'),
    SKYUX_PACKAGES_REPO_TEMP_DIR
  );

  const repository = 'blackbaud/skyux-packages';

  const repoUrl = `https://${accessToken}@github.com/${repository}.git`;

  // Clone blackbaud/skyux-packages repo as admin user.
  await cloneRepoAsAdmin(
    repoUrl,
    SKYUX_PACKAGES_REPO_BRANCH,
    SKYUX_PACKAGES_REPO_TEMP_DIR
  );

  const packageJsonPath = path.join(workingDirectory, 'package.json');

  let packageJson = fs.readJsonSync(packageJsonPath);

  // Abort if the library is not whitelisted on the `@skyux/packages` repo.
  if (!packageJson['ng-update'].packageGroup[libPackage.name]) {
    core.warning(
      `Tagging '${repository}' was aborted because the library '${libPackage.name}' is not listed in the \`packageGroup\` section of '${repository}' package.json file.`
    );
    return;
  }

  const versionDiff = semver.diff(libPackage.version, packageJson.version);

  const prereleaseData = semver.prerelease(packageJson.version);
  const prereleaseGroup = prereleaseData && prereleaseData[0];

  const libPrereleaseData = semver.prerelease(libPackage.version);
  const libPrereleaseGroup = libPrereleaseData && libPrereleaseData[0];

  let enableTagging = false;

  if (
    versionDiff === null || // versions are exactly the same
    versionDiff === 'minor' ||
    versionDiff === 'patch' ||
    (versionDiff === 'prerelease' && prereleaseGroup === libPrereleaseGroup)
  ) {
    enableTagging = true;
  } else if (versionDiff === 'major') {
    const majorVersion = semver.major(packageJson.version);
    const libMajorVersion = semver.major(libPackage.version);

    // If the library version is a prior major version, attempt to checkout
    // the respective major version branch (e.g. `5.x.x`).
    if (libMajorVersion < majorVersion) {
      const result = await checkoutMajorVersionBranch(
        workingDirectory,
        libMajorVersion
      );

      // Does the major version branch exist?
      if (result.includes('did not match any file(s) known to git')) {
        throw new Error(
          `Failed to tag the repository '${repository}'. A branch named '${getMajorVersionBranch(
            libMajorVersion
          )}' was not found.`
        );
      }

      packageJson = fs.readJsonSync(packageJsonPath);

      enableTagging = true;
    }
  }

  if (enableTagging) {
    // Update package.json with the bumped version.
    const newVersion = bumpVersion(packageJson.version);
    packageJson.version = newVersion;
    fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });

    updateChangelog(workingDirectory, newVersion, libPackage);

    if (!isDryRun) {
      await commitAndTag(workingDirectory, newVersion);
    } else {
      core.warning(
        `Tagging was aborted because the 'npm-dry-run' flag is set. The '${repository}' repository would have been tagged with (${newVersion}).`
      );
    }
  } else {
    const parsedVersion = semver.parse(libPackage.version)!;

    let targetRange = `^${parsedVersion.major}.0.0`;

    const prereleaseGroup =
      parsedVersion.prerelease && parsedVersion.prerelease[0];

    if (prereleaseGroup) {
      targetRange += `-${prereleaseGroup}.0`;
    }

    core.warning(
      `The '${libPackage.name}' package attempted to tag '${repository}' with a version ` +
        `in the same range as (${targetRange}) but a compatible version of '@skyux/packages' ` +
        `could not be found. Manually tag and release '${repository}' with a version that is in the ` +
        `same range as '${libPackage.name}@${targetRange}'.`
    );
  }
}
