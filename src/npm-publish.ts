import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';

import { notifySlack } from './notify-slack';
import { PackageMetadata } from './package-metadata';
import { spawn } from './spawn';
import { getTag } from './utils';

export async function npmPublish(distPath?: string): Promise<PackageMetadata> {
  distPath =
    distPath ||
    path.join(process.cwd(), core.getInput('working-directory'), 'dist');
  const packageJsonPath = path.join(distPath, 'package.json');

  const packageJson = fs.readJsonSync(packageJsonPath);
  const packageName = packageJson.name;
  const version = packageJson.version;

  const gitTag = getTag();
  const npmTag = gitTag.indexOf('-') > -1 ? 'next' : 'latest';
  const npmFilePath = path.join(distPath, '.npmrc');
  const npmToken = core.getInput('npm-token');

  const repository = process.env.GITHUB_REPOSITORY;
  const changelogUrl = `https://github.com/${repository}/blob/${version}/CHANGELOG.md`;

  if (gitTag !== version) {
    core.setFailed(
      `Aborted publishing to NPM because the version listed in package.json (${version}) does not match the git tag (${gitTag})!`
    );
    process.exit(1);
  }

  core.info(
    `Preparing to publish ${packageName}@${version} to NPM from ${distPath}...`
  );

  await fs.ensureFile(npmFilePath);
  fs.writeFileSync(npmFilePath, `//registry.npmjs.org/:_authToken=${npmToken}`);

  const npmArgs = ['publish', '--access', 'public', '--tag', npmTag];

  const isDryRun = core.getInput('npm-dry-run') === 'true';

  if (isDryRun) {
    npmArgs.push('--dry-run');
  }

  try {
    await spawn('npm', npmArgs, {
      cwd: distPath,
      stdio: 'inherit',
    });

    const successMessage = `Successfully published \`${packageName}@${version}\` to NPM.`;
    core.info(successMessage);
    if (!isDryRun) {
      await notifySlack(`${successMessage}\n${changelogUrl}`);
    }
  } catch (err) {
    const errorMessage = `\`${packageName}@${version}\` failed to publish to NPM.`;
    core.setFailed((err as Error).message);
    core.setFailed(errorMessage);
    if (!isDryRun) {
      await notifySlack(errorMessage);
    }
    process.exit(1);
  }

  fs.removeSync(npmFilePath);

  return {
    changelogUrl,
    name: packageName,
    version,
  };
}
