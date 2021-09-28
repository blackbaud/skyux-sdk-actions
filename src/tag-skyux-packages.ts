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
    : 'minor';

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
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  const contents = `# ${newVersion} (${year}-${month}-${day})

- \`${libPackage.name}@${libPackage.version}\` [Release notes](${libPackage.changelogUrl})

${changelog}`;

  fs.writeFileSync(changelogPath, contents, { encoding: 'utf-8' });
}

/**
 * Set the target version for certain `ng update` schematics to allow them to run
 * for every release of `@skyux/packages`.
 */
function updateSchematicVersions(workingDirectory: string, newVersion: string) {
  const collectionPath = path.join(
    workingDirectory,
    'src/schematics/migrations/migration-collection.json'
  );
  const contents = fs.readJsonSync(collectionPath);

  const schematics = ['noop', 'update-peer-dependencies'];
  for (const schematic of schematics) {
    contents.schematics[schematic].version = newVersion;
  }

  fs.writeJsonSync(collectionPath, contents, { spaces: 2 });
}

async function commitAndTag(
  workingDirectory: string,
  newVersion: string,
  branch: string
): Promise<void> {
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

  await spawn('git', ['push', 'origin', branch], spawnConfig);

  // Tag the commit and push to origin.
  await spawn('git', ['tag', newVersion], spawnConfig);
  await spawn('git', ['push', 'origin', newVersion], spawnConfig);
}

function getMajorVersionBranch(majorVersion: number): string {
  return `${majorVersion}.x.x`;
}

function checkoutBranch(
  branch: string,
  workingDirectory: string
): Promise<string> {
  const spawnConfig: child_process.SpawnOptions = {
    cwd: workingDirectory,
    stdio: 'inherit',
  };

  return spawn('git', ['checkout', branch], spawnConfig);
}

/**
 * After every SKY UX component library release, we also tag the `@skyux/packages` repo,
 * which is used by consumers of the Angular CLI to run `ng update @skyux/packages`.
 * Executing this command will update all component libraries the consumer has
 * installed at once.
 *
 * - If the library version is within the range specified in `packageGroup`, then bump the version of `@skyux/packages`.
 * - If the library version is greater than the version specified in `packageGroup`, abort.
 * - If the library version is less than the version specified in `packageGroup`, attempt to checkout the branch assigned to that major version (e.g. `4.x.x`).
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

  const packageGroupVersionRange: string =
    packageJson['ng-update'].packageGroup[libPackage.name] || '';

  // Abort if the library is not whitelisted on the `@skyux/packages` repo.
  if (!packageGroupVersionRange) {
    core.warning(
      `Tagging '${repository}' was aborted because the library '${libPackage.name}' is not listed in the \`packageGroup\` section of '${repository}' package.json file.`
    );
    return;
  }

  const libVersion = libPackage.version;

  let enableTagging = false;

  let branch = SKYUX_PACKAGES_REPO_BRANCH;

  if (semver.satisfies(libVersion, packageGroupVersionRange)) {
    enableTagging = true;
  } else {
    const libMajorVersion = semver.major(libVersion);
    const packageGroupMajorVersion = semver.minVersion(
      packageGroupVersionRange
    )!.major;

    // If the library version is a prior major version, attempt to checkout
    // the respective major version branch (e.g. `5.x.x`).
    if (libMajorVersion < packageGroupMajorVersion) {
      branch = getMajorVersionBranch(libMajorVersion);

      const result = await checkoutBranch(branch, workingDirectory);

      // Does the major version branch exist?
      if (result.includes('did not match any file(s) known to git')) {
        core.warning(
          `Failed to tag the repository '${repository}'. A branch named '${branch}' was not found.`
        );
        return;
      }

      // Assign the checkout version of package.json.
      packageJson = fs.readJsonSync(packageJsonPath);

      enableTagging = true;
    }
  }

  if (enableTagging) {
    // Update package.json with the bumped version.
    const newVersion = bumpVersion(packageJson.version);
    packageJson.version = newVersion;
    fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 });

    updateSchematicVersions(workingDirectory, newVersion);
    updateChangelog(workingDirectory, newVersion, libPackage);

    if (!isDryRun) {
      await commitAndTag(workingDirectory, newVersion, branch);
    } else {
      core.warning(
        `Tagging was aborted because the 'npm-dry-run' flag is set. The '${repository}' repository would have been tagged with (${newVersion}).`
      );
    }
  } else {
    core.warning(
      `Releasing '@skyux/packages' was aborted because the version tagged '${libPackage.name}@${libVersion}' ` +
        `does not satisfy the range listed in \`packageGroup\` for '${libPackage.name}'. Wanted (${packageGroupVersionRange}).`
    );
  }
}
