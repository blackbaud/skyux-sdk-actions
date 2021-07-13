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

function readPackageJson(workingDirectory: string): any {
  const packageJsonPath = path.join(workingDirectory, 'package.json');
  const packageJson = fs.readJsonSync(packageJsonPath);
  return packageJson;
}

function updatePackageJson(workingDirectory: string, contents: any): void {
  const packageJsonPath = path.join(workingDirectory, 'package.json');
  fs.writeJsonSync(packageJsonPath, contents, { spaces: 2 });
}

function bumpVersion(version: string): string {
  const releaseType = (version as string).includes('-')
    ? 'prerelease'
    : 'patch';

  const newVersion = semver.inc(version, releaseType) as string;

  return newVersion;
}

// function isVersionValid(currentVersion: string, newVersion: string): boolean {
//   console.log(
//     'EH?',
//     currentVersion,
//     newVersion,
//     semver.diff(currentVersion, newVersion)
//   );

//   // console.log(
//   //   'Hmmm...',
//   //   semver.diff('1.0.0', '2.0.0'),
//   //   semver.diff('1.0.0', '2.0.0-alpha.0'),
//   //   semver.diff('1.0.0-beta.0', '2.0.0'),
//   //   semver.diff('2.0.0', '1.0.0'),
//   //   semver.diff('2.0.0', '1.0.0-alpha.0'),
//   //   semver.diff('2.0.0-alpha.0', '1.0.0-alpha.0'),
//   //   semver.diff('2.0.0-alpha.0', '2.0.0-beta.0'),
//   //   semver.diff('2.0.0-beta.0', '2.0.0-alpha.1'),
//   //   semver.lt('2.0.0-beta.0', '2.0.0-alpha.1')
//   // );

//   const versionDiff = semver.diff(currentVersion, newVersion);

//   return versionDiff === 'patch' || versionDiff === 'prerelease';
// }

// function updatePackageJson(workingDirectory: string, newVersion: string): string {
//   const packageJsonPath = path.join(workingDirectory, 'package.json');
//   const packageJson = fs.readJsonSync(packageJsonPath);

//   const releaseType = (packageJson.version as string).includes('-')
//     ? 'prerelease'
//     : 'patch';

//   const newVersion = semver.inc(packageJson.version, releaseType) as string;

//   packageJson.version = newVersion;

//   fs.writeJsonSync(packageJsonPath, packageJson);

//   return newVersion;
// }

function updateChangelog(
  workingDirectory: string,
  newVersion: string,
  libraryPackage: PackageMetadata
): void {
  const changelogPath = path.join(workingDirectory, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath).toString();

  const date = new Date();

  const contents = `# ${newVersion} (${date.getFullYear()}-${date.getMonth()}-${date.getDate()})

- \`${libraryPackage.name}@${libraryPackage.version}\` [Release notes](${
    libraryPackage.changelogUrl
  })

${changelog}`;

  fs.writeFileSync(changelogPath, contents, { encoding: 'utf-8' });
}

async function commitAndTag(
  workingDirectory: string,
  packageJson: any,
  libraryPackage: PackageMetadata
) {
  const newVersion = bumpVersion(packageJson.version);
  packageJson.version = newVersion;

  updatePackageJson(workingDirectory, packageJson);
  updateChangelog(workingDirectory, newVersion, libraryPackage);

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

function checkoutMajorVersionBranch(
  workingDirectory: string,
  majorVersion: number
): Promise<string> {
  const spawnConfig: child_process.SpawnOptions = {
    cwd: workingDirectory,
    stdio: 'inherit',
  };

  return spawn('git', ['checkout', `${majorVersion}.x.x`], spawnConfig);
}

/**
 * After every SKY UX component library release, we also tag the `@skyux/packages` repo,
 * which is used by consumers of the Angular CLI to run `ng update @skyux/packages`.
 * Executing this command will update all component libraries the consumer has
 * installed at once.
 *
 * NOTE: Every major or premajor version must be initiated manually on the @skyux/packages repo.
 * For example, to allow for a new major version of '5.0.0' to be released, you need to manually
 * tag @skyux/packages with '5.0.0' (this would be the same for prerelease versions, '5.0.0-alpha.0' to
 * '5.0.0-beta.0', etc.). This is done so that each release level is deliberately made available
 * to consumers.
 *
 * @param libraryPackage Metadata describing the recently released SKY UX component library.
 */
export async function tagSkyuxPackages(
  libraryPackage: PackageMetadata
): Promise<void> {
  const accessToken = core.getInput('github-token');

  const workingDirectory = path.join(
    core.getInput('working-directory'),
    SKYUX_PACKAGES_REPO_TEMP_DIR
  );

  const repoUrl = `https://${accessToken}@github.com/skyux-packages.git`;

  // Clone blackbaud/skyux-packages repo as admin user.
  await cloneRepoAsAdmin(
    repoUrl,
    SKYUX_PACKAGES_REPO_BRANCH,
    SKYUX_PACKAGES_REPO_TEMP_DIR
  );

  // Update the CHANGELOG and package.json with a patch/minor version.
  let packageJson = readPackageJson(workingDirectory);

  const versionDiff = semver.diff(libraryPackage.version, packageJson.version);
  const prereleaseGroup = semver.parse(packageJson.version)!.prerelease[0];

  const libraryPrereleaseGroup = semver.parse(libraryPackage.version)!
    .prerelease[0];

  let success = false;

  if (
    versionDiff === null || // versions are exactly the same
    versionDiff === 'minor' ||
    versionDiff === 'patch' ||
    (versionDiff === 'prerelease' && prereleaseGroup === libraryPrereleaseGroup)
  ) {
    success = true;
  }

  if (versionDiff === 'major') {
    const majorVersion = semver.major(packageJson.version);
    const libraryMajorVersion = semver.major(libraryPackage.version);

    // If the library version is a prior major version, attempt to checkout
    // the respective major version branch (e.g. `5.x.x`).
    if (libraryMajorVersion < majorVersion) {
      const result = await checkoutMajorVersionBranch(
        workingDirectory,
        libraryMajorVersion
      );

      // Does the major version branch exist?
      if (result.includes('did not match any file(s) known to git')) {
        throw new Error(`Foobar!`);
      }

      packageJson = readPackageJson(workingDirectory);

      success = true;
    }
  }

  if (success) {
    await commitAndTag(workingDirectory, packageJson, libraryPackage);
  } else {
    core.warning(`Something bad happened.`);
  }

  // isVersionValid(libraryPackage.version, newVersion);

  // if (!isVersionValid(packageJson.version, newVersion)) {
  //   core.warning(
  //     `The version bump generated for '@skyux/packages' is not compatible with its current version. Manually tag and release '@skyux/packages' with a version in the same release category as the bumped version. (current: ${packageJson.version}, wanted: ${newVersion}).`
  //   );
  //   return;
  // }
}
