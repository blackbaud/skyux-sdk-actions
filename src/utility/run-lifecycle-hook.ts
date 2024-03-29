import * as core from '@actions/core';

import * as path from 'path';

/**
 * Runs lifecycle hook Node.js scripts. The script must export an async function named `runAsync`.
 * @example
 * ```
 * module.exports = {
 *   runAsync: async () => {}
 * };
 * ```
 * @param name The name of the lifecycle hook to call. See the `action.yml` file at the project root for possible options.
 */
export async function runLifecycleHook(name: string): Promise<void> {
  const scriptPath = core.getInput(name);
  if (scriptPath) {
    const basePath = path.join(
      process.cwd(),
      core.getInput('working-directory'),
    );

    const fullPath = path.join(basePath, scriptPath);

    core.info(`Running '${name}' lifecycle hook: ${fullPath}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const script = require(fullPath);

      await script.runAsync();

      core.info(`Lifecycle hook '${name}' successfully executed.`);
    } catch (err) {
      console.error('[SKY UX ERROR]:', err);
      core.setFailed(
        `The lifecycle hook '${name}' was not found or was not exported correctly.`,
      );
    }
  }
}
