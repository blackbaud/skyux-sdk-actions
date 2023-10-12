import mock from 'mock-require';
import path from 'path';

describe('npmPublish', () => {
  let infoSpy: jasmine.Spy;
  let failedLogSpy: jasmine.Spy;
  let fsSpyObj: jasmine.SpyObj<any>;
  let slackSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let getTagSpy: jasmine.Spy;
  let mockNpmDryRun: string;
  let mockPackageJson: any;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(process, 'exit');

    mockNpmDryRun = 'false';

    infoSpy = jasmine.createSpy('@actions/core.info');
    failedLogSpy = jasmine.createSpy('@actions/core.setFailed');

    mock('@actions/core', {
      getInput(key: string) {
        if (key === 'working-directory') {
          return 'MOCK_WORKING_DIRECTORY';
        } else if (key === 'npm-token') {
          return 'MOCK_TOKEN';
        } else if (key === 'npm-dry-run') {
          return mockNpmDryRun;
        }
        return '';
      },
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

    spawnSpy = jasmine.createSpy('spawn');

    mock('./spawn', {
      spawn: spawnSpy,
    });

    getTagSpy = jasmine.createSpy('getTag').and.returnValue('1.2.3');

    mock('./utils', {
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

  it('should publish to NPM', async (done: DoneFn) => {
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

    done();
  });

  it('should publish using the `next` tag', async (done: DoneFn) => {
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

    done();
  });

  it('should allow running `npm publish --dry-run`', async (done: DoneFn) => {
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

    done();
  });

  it('should handle errors', async (done: DoneFn) => {
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
    done();
  });

  it('should not notify Slack of errors if `--dry-run`', async (done: DoneFn) => {
    mockNpmDryRun = 'true';
    spawnSpy.and.throwError('Something bad happened.');

    const { npmPublish } = getUtil();

    await npmPublish();

    expect(failedLogSpy).toHaveBeenCalledWith('Something bad happened.');
    expect(failedLogSpy).toHaveBeenCalledWith(
      '`foo-package@1.2.3` failed to publish to NPM.',
    );
    expect(slackSpy).not.toHaveBeenCalled();
    done();
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
});
