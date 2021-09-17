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
      const version = projectPackageJson.peerDependencies[packageName];
      const specificVersion = version.replace(/^(\^|~)/, '');
      const workspaceVersion = workspacePackageJson.dependencies[packageName];
      if (specificVersion !== workspaceVersion) {
        errors.push(
          `The version range (${version}) of the peer dependency "${packageName}" listed in '${projectPackageJsonPath.replace(
            basePath,
            ''
          )}' ` +
            `does not match the version listed in the root '${workspacePackageJsonPath.replace(
              basePath,
              ''
            )}'. Provided: (${workspaceVersion}) Wanted: (${specificVersion})). ` +
            `The version of the dependency listed in the root '${workspacePackageJsonPath.replace(
              basePath,
              ''
            )}' \`dependencies\` section must be specific, and must not include a range character ` +
            `(for example, write \`"${specificVersion}"\` instead of \`"${workspaceVersion}"\`).`
        );
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
