import * as core from '@actions/core';
import { cloneRepoAsAdmin } from './clone-repo-as-admin';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

const REPO_TEMP_DIR = '.skyuxpackagestemp';

export async function tagSkyuxPackages() {
  const accessToken = core.getInput('github-token');
  const workingDirectory = path.join(core.getInput('working-directory'), REPO_TEMP_DIR);

  const repoUrl = `https://${accessToken}@github.com/skyux-packages.git`;

  // Clone blackbaud/skyux-packages repo as admin user.
  await cloneRepoAsAdmin(repoUrl, 'master', REPO_TEMP_DIR);

  const spawnConfig = {
    cwd: workingDirectory
  };

  // Update the CHANGELOG and package.json with a patch/minor version.
  const packageJsonPath = path.join(workingDirectory, 'package.json');
  const packageJson = fs.readJsonSync(packageJsonPath);
  const newVersion = semver.inc(packageJson.version);

  packageJson.version = newVersion;

  fs.writeJsonSync(packageJsonPath, packageJson);

  const changelogPath = path.join(workingDirectory, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath).toString();
  const date = new Date();
  fs.writeFileSync(changelogPath, `# ${newVersion} (${date})

${changelog}`, { encoding: 'utf-8' });

  // Commit directly to master branch.

  // Tag the commit and push to origin.
}
