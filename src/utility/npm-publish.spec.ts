import mock from 'mock-require';
import path from 'path';

describe('npmPublish', () => {
  let infoSpy: jasmine.Spy;
  let errorSpy: jasmine.Spy;
  let failedLogSpy: jasmine.Spy;
  let fsSpyObj: jasmine.SpyObj<any>;
  let slackSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let getTagSpy: jasmine.Spy;
  let mockNpmDryRun: string;
  let mockNpmToken: string;
  let mockPackageJson: any;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(process, 'exit');

    mockNpmDryRun = 'false';
    mockNpmToken = 'MOCK_TOKEN';

    infoSpy = jasmine.createSpy('@actions/core.info');
    errorSpy = jasmine.createSpy('@actions/core.error');
    failedLogSpy = jasmine.createSpy('@actions/core.setFailed');

    mock('@actions/core', {
      getInput(key: string) {
        if (key === 'working-directory') {
          return 'MOCK_WORKING_DIRECTORY';
        } else if (key === 'npm-token') {
          return mockNpmToken;
        } else if (key === 'npm-dry-run') {
          return mockNpmDryRun;
        }
        return '';
      },
      error: errorSpy,
      info: infoSpy,
      setFailed: failedLogSpy,
    });

    fsSpyObj = jasmine.createSpyObj('fs-extra', [
      'ensureFile',
      'readJsonSync',
      'removeSync',
      'writeFileSync',
    ]);

    mockPackageJson = {
      name: 'foo-package',
      version: '1.2.3',
    };

    fsSpyObj.readJsonSync.and.returnValue(mockPackageJson);

    mock('fs-extra', fsSpyObj);

    slackSpy = jasmine.createSpy('notifySlack');

    mock('./notify-slack', {
      notifySlack: slackSpy,
    });

    spawnSpy = jasmine.createSpy('spawn').and.returnValue(Promise.resolve(''));

    mock('./spawn', {
      spawn: spawnSpy,
    });

    getTagSpy = jasmine.createSpy('getTag').and.returnValue('1.2.3');

    mock('./context', {
      getTag: getTagSpy,
    });
  });

  afterEach(() => {
    process.env.GITHUB_REPOSITORY = undefined;
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./npm-publish');
  }

  it('should publish to NPM', async () => {
    const { npmPublish } = getUtil();

    await npmPublish();

    expect(fsSpyObj.writeFileSync).toHaveBeenCalledWith(
      `${path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist', '.npmrc')}`,
      '//registry.npmjs.org/:_authToken=MOCK_TOKEN',
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'Successfully published `foo-package@1.2.3` to NPM.',
    );

    expect(slackSpy).toHaveBeenCalledWith(
      'Successfully published `foo-package@1.2.3` to NPM.\nhttps://github.com/org/repo/blob/1.2.3/CHANGELOG.md',
    );

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
  });

  it('should publish to NPM without npm-token', async () => {
    mockNpmToken = '';

    const { npmPublish, nodeVersionGetter } = getUtil();

    spyOn(nodeVersionGetter, 'getVersion').and.returnValue('v24.0.0');

    await npmPublish();

    expect(fsSpyObj.ensureFile).not.toHaveBeenCalled();
    expect(fsSpyObj.writeFileSync).not.toHaveBeenCalled();

    expect(infoSpy).toHaveBeenCalledWith(
      'Successfully published `foo-package@1.2.3` to NPM.',
    );

    expect(slackSpy).toHaveBeenCalledWith(
      'Successfully published `foo-package@1.2.3` to NPM.\nhttps://github.com/org/repo/blob/1.2.3/CHANGELOG.md',
    );

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
  });

  it('should publish using the `next` tag', async () => {
    getTagSpy.and.callThrough();
    getTagSpy.and.returnValue('1.0.0-rc.0');

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'next'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
  });

  it('should allow running `npm publish --dry-run`', async () => {
    mockNpmDryRun = 'true';

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest', '--dry-run'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
  });

  it('should handle errors', async () => {
    spawnSpy.and.throwError('Something bad happened.');

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(failedLogSpy).toHaveBeenCalledWith('Something bad happened.');
    expect(failedLogSpy).toHaveBeenCalledWith(
      '`foo-package@1.2.3` failed to publish to NPM.',
    );
    expect(slackSpy).toHaveBeenCalledWith(
      '`foo-package@1.2.3` failed to publish to NPM.',
    );
  });

  it('should not notify Slack of errors if `--dry-run`', async () => {
    mockNpmDryRun = 'true';
    spawnSpy.and.throwError('Something bad happened.');

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(failedLogSpy).toHaveBeenCalledWith('Something bad happened.');
    expect(failedLogSpy).toHaveBeenCalledWith(
      '`foo-package@1.2.3` failed to publish to NPM.',
    );
    expect(slackSpy).not.toHaveBeenCalled();
  });

  it('should throw an error if tag does not match package.json version', async () => {
    mockPackageJson.version = '1.0.0';
    getTagSpy.and.returnValue('1.1.0');

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(failedLogSpy).toHaveBeenCalledWith(
      'Aborted publishing to NPM because the version listed in package.json (1.0.0) does not match the git tag (1.1.0)!',
    );
  });

  it('should use npm from Node.js 24 when current Node version is below 24 and no token is provided', async () => {
    mockNpmToken = '';

    const { npmPublish, nodeVersionGetter } = getUtil();

    spyOn(nodeVersionGetter, 'getVersion').and.returnValue('v20.0.0');

    spawnSpy.and.callFake((command: string, _args: string[]) => {
      if (command === 'n' && _args[0] === 'which') {
        return Promise.resolve('/mock/n/versions/node/v24.0.0/bin/node');
      }
      return Promise.resolve();
    });

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'n',
      ['install', '24'],
      jasmine.any(Object),
    );
    expect(spawnSpy).toHaveBeenCalledWith(
      'n',
      ['which', '24'],
      jasmine.any(Object),
    );
    expect(spawnSpy).toHaveBeenCalledWith(
      '/mock/n/versions/node/v24.0.0/bin/npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
  });

  it('should fail if Node.js 24 is not available when current Node version is below 24 and no token is provided', async () => {
    mockNpmToken = '';

    const { npmPublish, nodeVersionGetter } = getUtil();

    spawnSpy.and.callFake((command: string, _args: string[]) => {
      if (command === 'n') {
        return Promise.reject();
      }
      return Promise.resolve();
    });

    spyOn(nodeVersionGetter, 'getVersion').and.returnValue('v20.0.0');

    await expectAsync(npmPublish()).toBeRejectedWith(
      'Aborted publishing to NPM with trusted publishing because NPM from Node.js 24 could not be found!',
    );

    expect(spawnSpy).toHaveBeenCalledWith(
      'n',
      ['install', '24'],
      jasmine.any(Object),
    );
    expect(spawnSpy).toHaveBeenCalledWith(
      'n',
      ['which', '24'],
      jasmine.any(Object),
    );
  });

  it('should use regular npm when Node version is 24 or above and no token is provided', async () => {
    mockNpmToken = '';

    const { npmPublish, nodeVersionGetter } = getUtil();

    spyOn(nodeVersionGetter, 'getVersion').and.returnValue('v24.0.0');

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
    expect(spawnSpy).not.toHaveBeenCalledWith('n', jasmine.any(Array));
  });

  it('should use regular npm when token is provided regardless of Node version', async () => {
    const { npmPublish, nodeVersionGetter } = getUtil();

    spyOn(nodeVersionGetter, 'getVersion').and.returnValue('v20.0.0');

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      {
        cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY', 'dist'),
        stdio: 'inherit',
      },
    );
    expect(spawnSpy).not.toHaveBeenCalledWith('n', jasmine.any(Array));
  });
});
