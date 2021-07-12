import {
  spawn
} from './spawn';

export async function cloneRepoAsAdmin(gitUrl: string, branch: string, directory: string): Promise<void> {
  await spawn('git', ['config', '--global', 'user.email', '"sky-build-user@blackbaud.com"']);
  await spawn('git', ['config', '--global', 'user.name', '"Blackbaud Sky Build User"']);
  await spawn('git', ['clone', gitUrl, '--branch', branch, '--single-branch', directory]);
}
