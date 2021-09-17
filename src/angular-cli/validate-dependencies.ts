import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

interface ValidateDependenciesResult {
  error?: string | null;
}

export function validateDependencies(
  projectName: string
): ValidateDependenciesResult {
  const basePath = path.join(process.cwd(), core.getInput('working-directory'));

  const workspacePackageJsonPath = path.join(basePath, 'package.json');

  const projectPackageJsonPath = path.join(
    basePath,
    `projects/${projectName}/package.json`
  );

  const workspacePackageJson = fs.readJsonSync(workspacePackageJsonPath);
  const projectPackageJson = fs.readJsonSync(projectPackageJsonPath);

  const result: ValidateDependenciesResult = {};

  // Validate peer dependencies.
  if (projectPackageJson.peerDependencies) {
    for (const packageName in projectPackageJson.peerDependencies) {
      const specificVersion = packageName.replace(/^(\^|~)/, '');
      if (specificVersion !== workspacePackageJson.dependencies[packageName]) {
        result.error =
          `The version of the peer dependency "${packageName}" listed in '${projectPackageJsonPath.replace(
            basePath,
            ''
          )}' ` +
          `does not match the version of the same dependency listed in '${workspacePackageJsonPath.replace(
            basePath,
            ''
          )}'. ` +
          `The version provided in the \`dependencies\` section must be specific, and not include a range character ` +
          `(for example, write \`"5.1.2"\` instead of \`"^5.1.0"\`).`;
      }
    }
  }

  return result;
}
