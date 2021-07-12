import { spawn } from './spawn';

/**
 * Checks if a specified directory has git changes.
 * @param dir The directory to check.
 */
export async function directoryHasChanges(dir: string): Promise<boolean> {
  const output = await spawn('git', ['status', dir, '--porcelain']);
  if (!output) {
    return false;
  }

  // Untracked files are prefixed with '??'
  // Modified files are prefixed with 'M'
  // https://git-scm.com/docs/git-status/1.8.1#_output
  // https://stackoverflow.com/a/6978402/6178885
  return output.indexOf('??') === 0 || output.indexOf('M') === 0;
}
