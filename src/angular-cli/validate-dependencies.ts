import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

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
    for (const packageName in projectPackageJson.peerDependencies) {
      const peerVersion = projectPackageJson.peerDependencies[packageName];
      const specificPeerVersion = peerVersion.replace(/^(\^|~)/, '');
      const workspaceVersion = workspacePackageJson.dependencies[packageName];
      const workspaceSpecificVersion = workspaceVersion.replace(/^(\^|~)/, '');

      if (specificPeerVersion !== workspaceVersion) {
        errors.push(
          `The version (${workspaceVersion}) of the package "${packageName}" listed in the \`dependencies\` section of 'package.json' does not meet the minimum version requirements of the range defined in the \`peerDependencies\` section of 'projects/${projectName}/package.json' (wanted "${packageName}@${peerVersion}"). The version listed in 'package.json' for "${packageName}" must be set to a specific version (without a semver range character), and set to the minimum version satisfied by the peer dependency range. Either increase the minimum supported version in 'projects/${projectName}/package.json' to (^${workspaceSpecificVersion}), or downgrade the version installed in the root 'package.json' to (${specificPeerVersion}).`
        );
        // errors.push(
        //   `The version range (${version}) of the peer dependency "${packageName}" listed in '${projectPackageJsonPath.replace(
        //     basePath,
        //     ''
        //   )}' ` +
        //     `does not match the version listed in the root '${workspacePackageJsonPath.replace(
        //       basePath,
        //       ''
        //     )}'. Provided: (${workspaceVersion}) Wanted: (${specificVersion})). ` +
        //     `The version of the dependency listed in the root '${workspacePackageJsonPath.replace(
        //       basePath,
        //       ''
        //     )}' \`dependencies\` section must be specific, and must not include a range character ` +
        //     `(for example, write \`"${specificVersion}"\` instead of \`"${workspaceVersion}"\`).`
        // );
      }
    }
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
