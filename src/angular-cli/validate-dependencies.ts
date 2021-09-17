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
      const specificVersion = packageName.replace(/^(\^|~)/, '');
      if (specificVersion !== workspacePackageJson.dependencies[packageName]) {
        errors.push(
          `The version of the peer dependency "${packageName}" listed in '${projectPackageJsonPath.replace(
            basePath,
            ''
          )}' ` +
            `does not match the version of the same dependency listed in '${workspacePackageJsonPath.replace(
              basePath,
              ''
            )}'. ` +
            `The version provided in the \`dependencies\` section must be specific, and not include a range character ` +
            `(for example, write \`"5.1.2"\` instead of \`"^5.1.0"\`).`
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
