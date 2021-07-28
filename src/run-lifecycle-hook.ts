import core from '@actions/core';

import path from 'path';

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
export async function runLifecycleHook(name: string) {
  const scriptPath = core.getInput(name);
  if (scriptPath) {
    const basePath = path.join(
      process.cwd(),
      core.getInput('working-directory')
    );
    const fullPath = path.join(basePath, scriptPath);
    core.info(`Running '${name}' lifecycle hook: ${fullPath}`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const script = require(fullPath);

    await script.runAsync();
    core.info(`Lifecycle hook '${name}' successfully executed.`);
  }
}
