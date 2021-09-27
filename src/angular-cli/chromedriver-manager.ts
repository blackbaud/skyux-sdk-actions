import matcher from 'chromedriver-version-matcher';
import spawn from 'cross-spawn';
import path from 'path';

const versionMatcher: any = matcher;

async function getVersion() {
  const defaultVersion = 'latest';
  const result = await versionMatcher.getChromeDriverVersion();
  return result.chromeDriverVersion || defaultVersion;
}

export async function updateChromeDriver() {
  const version = await getVersion();

  console.log(`Updating webdriver to version ${version}`);

  const binaryPath = path.resolve('node_modules/.bin/webdriver-manager');

  const result = spawn.sync(
    binaryPath,
    [
      'update',
      '--standalone=false',
      '--gecko=false',
      '--versions.chrome',
      version,
    ],
    {
      stdio: 'inherit',
    }
  );

  if (result.error) {
    console.error('Failed to update webdriver.');
    throw result.error;
  }

  console.log('Webdriver successfully updated.');
}
