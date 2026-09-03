import * as core from '@actions/core';

import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';

import { getTag } from './context';
import { notifySlack } from './notify-slack';
import { PackageMetadata } from './package-metadata';
import { spawn } from './spawn';

// The first versions of NPM and Node.js that support trusted publishing.
const MIN_TRUSTED_PUBLISHING_NPM_VERSION = '11.5.1';
const MIN_TRUSTED_PUBLISHING_NODE_VERSION = '22.14.0';

async function getInstalledVersion(
  command: string,
  displayName: string,
): Promise<semver.SemVer | undefined> {
  const version = await spawn(command, ['--version'])
    .then((result) => semver.coerce(result?.trim()))
    .catch(() => undefined);

  if (!version) {
    core.warning(
      `Could not determine the version of ${displayName} installed.`,
    );
    return undefined;
  }

  core.info(`Found ${displayName} version ${version.version}.`);

  return version;
}

async function isTrustedPublishingSupported(): Promise<boolean> {
  const npmVersion = await getInstalledVersion('npm', 'NPM');
  const nodeVersion = await getInstalledVersion('node', 'Node.js');

  return (
    !!npmVersion &&
    !!nodeVersion &&
    semver.gte(npmVersion, MIN_TRUSTED_PUBLISHING_NPM_VERSION) &&
    semver.gte(nodeVersion, MIN_TRUSTED_PUBLISHING_NODE_VERSION)
  );
}

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
      `Aborted publishing to NPM because the version listed in package.json (${version}) does not match the git tag (${gitTag})!`,
    );
    process.exit(1);
  }

  core.info(
    `Preparing to publish ${packageName}@${version} to NPM from ${distPath}...`,
  );

  let npmCommand: string | undefined = 'npm';
  if (npmToken) {
    await fs.ensureFile(npmFilePath);
    fs.writeFileSync(
      npmFilePath,
      `//registry.npmjs.org/:_authToken=${npmToken}`,
    );
  } else if (!(await isTrustedPublishingSupported())) {
    // Use npm from Node.js 24 if no token is provided to use NPM 11 and trusted publishing.
    const env = {
      ...process.env,
      N_PREFIX: path.join(process.env['RUNNER_TEMP'] ?? process.cwd(), '.n'),
    };
    await spawn('n', ['install', '24'], { env }).catch((err) => {
      core.error(err);
    });
    npmCommand = await spawn('n', ['which', '24'], { env })
      .then((result) => path.join(path.dirname(result?.trim()), 'npm'))
      .catch(() => undefined);
    if (!npmCommand) {
      core.setFailed(
        'Aborted publishing to NPM with trusted publishing because NPM from Node.js 24 could not be found!',
      );
      return Promise.reject(
        'Aborted publishing to NPM with trusted publishing because NPM from Node.js 24 could not be found!',
      );
    }
  }

  const npmArgs = ['publish', '--access', 'public', '--tag', npmTag];

  const isDryRun = core.getInput('npm-dry-run') === 'true';

  if (isDryRun) {
    npmArgs.push('--dry-run');
  }

  try {
    await spawn(npmCommand, npmArgs, {
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
