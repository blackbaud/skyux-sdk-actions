import * as core from '@actions/core';
import * as fs from 'fs-extra';
import * as path from 'path';

import {
  notifySlack
} from './notify-slack';

import {
  spawn
} from './spawn';

import {
  getTag
} from './utils';

export async function npmPublish() {
  const distPath = path.join(process.cwd(), core.getInput('working-directory'), 'dist');
  const packageJsonPath = path.join(distPath, 'package.json');

  const packageJson = fs.readJsonSync(packageJsonPath);
  const packageName = packageJson.name;
  const version = packageJson.version;

  const npmTag = (getTag().indexOf('-') > -1) ? 'next' : 'latest';
  const npmFilePath = path.join(distPath, '.npmrc');
  const npmToken = core.getInput('npm-token');

  const repository = process.env.GITHUB_REPOSITORY;
  const changelogUrl = `https://github.com/${repository}/blob/${version}/CHANGELOG.md`;

  core.info(`Preparing to publish ${packageName}@${version} to NPM from ${distPath}...`);

  await fs.ensureFile(npmFilePath);
  fs.writeFileSync(npmFilePath, `//registry.npmjs.org/:_authToken=${npmToken}`);

  try {
    await spawn('npm', ['publish', '--access', 'public', '--tag', npmTag], { cwd: distPath });
    const successMessage = `Successfully published ${packageName}@${version} to NPM.`;
    core.info(successMessage);
    await notifySlack(`${successMessage}\n${changelogUrl}`);
  } catch (err) {
    const errorMessage = `${packageName}@${version} failed to publish to NPM.`;
    core.setFailed(err.message);
    core.setFailed(errorMessage);
    await notifySlack(errorMessage);
  }

  fs.removeSync(npmFilePath);
}
