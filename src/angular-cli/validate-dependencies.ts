import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

function validateDependencySection(
  section: string,
  projectName: string,
  projectPackageJson: any,
  workspacePackageJson: any
): string[] {
  const errors: string[] = [];

  for (const packageName in projectPackageJson[section]) {
    const peerVersion = projectPackageJson[section][packageName];
    const specificPeerVersion = peerVersion.replace(/^(\^|~)/, '');
    const workspaceVersion = workspacePackageJson.dependencies[packageName];
    const workspaceSpecificVersion = workspaceVersion.replace(/^(\^|~)/, '');

    if (specificPeerVersion !== workspaceVersion) {
      errors.push(
        `The version (${workspaceVersion}) of the package "${packageName}" in the \`dependencies\` section of 'package.json' does not meet the minimum version requirements of the range defined in the \`${section}\` section of 'projects/${projectName}/package.json' (wanted "${packageName}@${peerVersion}"). The version listed in 'package.json' for "${packageName}" must be set to a specific version (without a semver range character), and set to the minimum version satisfied by the requested range. Either increase the minimum supported version in 'projects/${projectName}/package.json' to (^${workspaceSpecificVersion}), or downgrade the version installed in the root 'package.json' to (${specificPeerVersion}).`
      );
    }
  }

  return errors;
}

export function validateDependencies(projectName: string): void {
  core.info('Validationg dependencies...');

  const basePath = path.join(process.cwd(), core.getInput('working-directory'));

  const workspacePackageJsonPath = path.join(basePath, 'package.json');

  const projectPackageJsonPath = path.join(
    basePath,
    `projects/${projectName}/package.json`
  );

  const workspacePackageJson = fs.readJsonSync(workspacePackageJsonPath);
  const projectPackageJson = fs.readJsonSync(projectPackageJsonPath);

  const errors: string[] = [];

  // Validate peer dependencies.
  if (projectPackageJson.peerDependencies) {
    errors.concat(
      validateDependencySection(
        'peerDependencies',
        projectName,
        projectPackageJson,
        workspacePackageJson
      )
    );
    // for (const packageName in projectPackageJson.peerDependencies) {
    //   const peerVersion = projectPackageJson.peerDependencies[packageName];
    //   const specificPeerVersion = peerVersion.replace(/^(\^|~)/, '');
    //   const workspaceVersion = workspacePackageJson.dependencies[packageName];
    //   const workspaceSpecificVersion = workspaceVersion.replace(/^(\^|~)/, '');
    //   if (specificPeerVersion !== workspaceVersion) {
    //     errors.push(
    //       `The version (${workspaceVersion}) of the package "${packageName}" in the \`dependencies\` section of 'package.json' does not meet the minimum version requirements of the range defined in the \`peerDependencies\` section of 'projects/${projectName}/package.json' (wanted "${packageName}@${peerVersion}"). The version listed in 'package.json' for "${packageName}" must be set to a specific version (without a semver range character), and set to the minimum version satisfied by the peer dependency range. Either increase the minimum supported version in 'projects/${projectName}/package.json' to (^${workspaceSpecificVersion}), or downgrade the version installed in the root 'package.json' to (${specificPeerVersion}).`
    //     );
    //   }
    // }
  }

  if (projectPackageJson.dependencies) {
    errors.concat(
      validateDependencySection(
        'dependencies',
        projectName,
        projectPackageJson,
        workspacePackageJson
      )
    );
  }

  if (errors.length > 0) {
    errors.forEach((error) => {
      core.error(error);
    });
    core.setFailed('Errors found with library dependencies.');
    process.exit(1);
  }

  core.info(`Done validating dependencies.`);
}
