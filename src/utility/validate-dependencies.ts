import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';
import semver from 'semver';

function validateDependencySection(
  section: string,
  projectName: string,
  projectPackageJson: any,
  workspacePackageJson: any,
): string[] {
  const errors: string[] = [];

  for (const packageName in projectPackageJson[section]) {
    const targetVersion = projectPackageJson[section][packageName];

    const minTargetVersion = semver.minVersion(targetVersion)!.version;

    const workspaceVersion = workspacePackageJson.dependencies[packageName];

    if (!workspaceVersion) {
      errors.push(
        `The package "${packageName}" listed in the \`${section}\` section of 'projects/${projectName}/package.json' ` +
          `was not found in the root 'package.json' \`dependencies\` section. Install the package at the root level and try again.`,
      );
      continue;
    }

    const minWorkspaceVersion = semver.minVersion(workspaceVersion)!.version;

    if (workspaceVersion !== minWorkspaceVersion) {
      errors.push(
        `The version listed in 'package.json' for "${packageName}@${workspaceVersion}" must be set to a specific version ` +
          `(without a semver range character), and set to the minimum version satisfied by the range defined in the \`${section}\` ` +
          `section of 'projects/${projectName}/package.json' (wanted "${packageName}@${targetVersion}"). To address this problem, set ` +
          `"${packageName}" to (${minTargetVersion}) in the root 'package.json'.`,
      );
    } else if (workspaceVersion !== minTargetVersion) {
      errors.push(
        `The version (${workspaceVersion}) of the package "${packageName}" in the \`dependencies\` section of 'package.json' ` +
          `does not meet the minimum version requirements of the range defined in the \`${section}\` section of ` +
          `'projects/${projectName}/package.json' (wanted "${packageName}@${targetVersion}"). Either increase the minimum ` +
          `supported version in 'projects/${projectName}/package.json' to (^${minWorkspaceVersion}), or downgrade the ` +
          `version installed in the root 'package.json' to (${minTargetVersion}).`,
      );
    }
  }

  return errors;
}

export function validateDependencies(projectName: string): void {
  core.info('Validating dependencies...');

  try {
    const basePath = path.join(
      process.cwd(),
      core.getInput('working-directory'),
    );

    const workspacePackageJsonPath = path.join(basePath, 'package.json');

    const projectPackageJsonPath = path.join(
      basePath,
      `projects/${projectName}/package.json`,
    );

    const workspacePackageJson = fs.readJsonSync(workspacePackageJsonPath);
    const projectPackageJson = fs.readJsonSync(projectPackageJsonPath);

    const errors: string[] = [];

    // Validate peer dependencies.
    if (projectPackageJson.peerDependencies) {
      errors.push(
        ...validateDependencySection(
          'peerDependencies',
          projectName,
          projectPackageJson,
          workspacePackageJson,
        ),
      );
    }

    // Validate dependencies.
    if (projectPackageJson.dependencies) {
      errors.push(
        ...validateDependencySection(
          'dependencies',
          projectName,
          projectPackageJson,
          workspacePackageJson,
        ),
      );
    }

    if (errors.length > 0) {
      errors.forEach((error) => {
        core.error(error);
      });
      throw new Error('Errors found with library dependencies.');
    }

    core.info(`Done validating dependencies. OK.`);
  } catch (err) {
    core.setFailed('Failed to validate library dependencies.');
    console.error(err);
    process.exit(1);
  }
}
