import { spawn } from './spawn';

const ADMIN_EMAIL = 'sky-build-user@blackbaud.com';
const ADMIN_USER_NAME = 'Blackbaud Sky Build User';

export async function cloneRepoAsAdmin(
  gitUrl: string,
  branch: string,
  directory: string
): Promise<void> {
  await spawn('git', ['config', '--global', 'user.email', `"${ADMIN_EMAIL}"`]);

  await spawn('git', [
    'config',
    '--global',
    'user.name',
    `"${ADMIN_USER_NAME}"`,
  ]);

  await spawn('git', [
    'clone',
    gitUrl,
    '--branch',
    branch,
    '--single-branch',
    directory,
  ]);
}
