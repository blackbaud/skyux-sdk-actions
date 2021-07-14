import mock from 'mock-require';
import path from 'path';

describe('Tag `@skyux/packages`', () => {
  let cloneRepoAsAdminSpy: jasmine.Spy;
  let fsSpyObj: jasmine.SpyObj<any>;
  let mockGitCheckoutResult: string;
  let mockPackageGroup: any;
  let mockSkyuxPackagesCheckoutVersion: string;
  let mockSkyuxPackagesVersion: string;
  let readJsonSyncCounter: number;
  let spawnSpy: jasmine.Spy;
  let warningSpy: jasmine.Spy;

  beforeEach(() => {
    fsSpyObj = jasmine.createSpyObj('fs-extra', [
      'readFileSync',
      'readJsonSync',
      'writeFileSync',
      'writeJsonSync',
    ]);

    fsSpyObj.readFileSync.and.callFake(() => {
      return Buffer.from('ORIGINAL_CHANGELOG_CONTENT\n');
    });

    readJsonSyncCounter = 0;
    mockPackageGroup = {
      '@skyux/foobar': '^5.0.0',
    };
    mockSkyuxPackagesVersion = '2.0.0';
    mockSkyuxPackagesCheckoutVersion = '1.0.0';

    fsSpyObj.readJsonSync.and.callFake(() => {
      let packageJson: any = {
        version: mockSkyuxPackagesVersion,
        'ng-update': {
          packageGroup: mockPackageGroup,
        },
      };

      // The first time package.json is read return what's in the master branch.
      // Subsequent reads will be from another major-version-specific branch (e.g. `4.x.x`).
      if (readJsonSyncCounter > 0) {
        packageJson = {
          version: mockSkyuxPackagesCheckoutVersion,
          'ng-update': {
            packageGroup: mockPackageGroup,
          },
        };
      }

      readJsonSyncCounter++;

      return packageJson;
    });

    spawnSpy = jasmine.createSpy('spawn');

    mockGitCheckoutResult = '';

    spawnSpy.and.callFake((command: string, args: string[]) => {
      if (command === 'git' && args.includes('checkout')) {
        return Promise.resolve(mockGitCheckoutResult);
      }

      return Promise.resolve('');
    });

    cloneRepoAsAdminSpy = jasmine.createSpy('cloneRepoAsAdmin');

    warningSpy = jasmine.createSpy('warning');

    mock('@actions/core', {
      getInput(key: string) {
        switch (key) {
          case 'github-token':
            return 'MOCK_TOKEN';
          case 'working-directory':
            return 'mock-working-directory';
          default:
            return '';
        }
      },
      warning: warningSpy,
    });

    mock('fs-extra', fsSpyObj);

    mock('./clone-repo-as-admin', {
      cloneRepoAsAdmin: cloneRepoAsAdminSpy,
    });

    mock('./spawn', {
      spawn: spawnSpy,
    });
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./tag-skyux-packages');
  }

  function verifySpawn(command: string, args: string[]) {
    expect(spawnSpy).toHaveBeenCalledWith(command, args, {
      cwd: path.join('mock-working-directory/.skyuxpackagestemp'),
      stdio: 'inherit',
    });
  }

  it('should update and commit changelog/package.json to blackbaud/skyux-packages repo', async () => {
    mockSkyuxPackagesVersion = '1.0.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '1.0.0',
    });

    expect(cloneRepoAsAdminSpy).toHaveBeenCalledWith(
      'https://MOCK_TOKEN@github.com/blackbaud/skyux-packages.git',
      'master',
      '.skyuxpackagestemp'
    );

    const date = new Date();

    expect(fsSpyObj.writeFileSync).toHaveBeenCalledWith(
      path.join('mock-working-directory/.skyuxpackagestemp/CHANGELOG.md'),
      `# 1.0.1 (${date.getFullYear()}-${date.getMonth()}-${date.getDate()})

- \`@skyux/foobar@1.0.0\` [Release notes](https://changelog.com)

ORIGINAL_CHANGELOG_CONTENT
`,
      { encoding: 'utf-8' }
    );

    expect(fsSpyObj.writeJsonSync).toHaveBeenCalledWith(
      path.join('mock-working-directory/.skyuxpackagestemp/package.json'),
      {
        version: '1.0.1',
        'ng-update': { packageGroup: { '@skyux/foobar': '^5.0.0' } },
      },
      { spaces: 2 }
    );

    verifySpawn('git', ['add', '.']);
    verifySpawn('git', [
      'commit',
      '-m',
      'Updated changelog/package.json for 1.0.1 release',
    ]);
    verifySpawn('git', ['push', 'origin', 'master']);
  });

  it('should tag patch releases', async () => {
    mockSkyuxPackagesVersion = '5.2.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.1',
    });

    verifySpawn('git', ['tag', '5.2.1']);
    verifySpawn('git', ['push', 'origin', '5.2.1']);
  });

  it('should tag prerelease versions in the same prerelease group', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0-alpha.15',
    });

    verifySpawn('git', ['tag', '5.0.0-alpha.1']);
  });

  it('should tag releases for prior major versions', async () => {
    mockSkyuxPackagesVersion = '6.1.0';
    mockSkyuxPackagesCheckoutVersion = '5.9.2';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.1.1',
    });

    verifySpawn('git', ['checkout', '5.x.x']);
    verifySpawn('git', ['tag', '5.9.3']);
  });

  it('should throw error if prior major version does not have a matching dev branch', async () => {
    mockSkyuxPackagesVersion = '5.3.0';
    mockGitCheckoutResult = 'did not match any file(s) known to git';

    const { tagSkyuxPackages } = getUtil();

    await expectAsync(
      tagSkyuxPackages({
        changelogUrl: 'https://changelog.com',
        name: '@skyux/foobar',
        version: '4.1.1',
      })
    ).toBeRejectedWithError(
      "Failed to tag the repository 'blackbaud/skyux-packages'. A branch named '4.x.x' was not found."
    );
  });

  it('should abort if library prerelease version not in the same prerelease group', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.3';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0-beta.3', // <-- Important, not 'alpha'.
    });

    expect(warningSpy).toHaveBeenCalledWith(
      "The '@skyux/foobar' package attempted to tag 'blackbaud/skyux-packages' with a version in the same range as (^5.0.0-beta.0) but a compatible version of '@skyux/packages' could not be found. Manually tag and release 'blackbaud/skyux-packages' with a version that is in the same range as '@skyux/foobar@^5.0.0-beta.0'."
    );
  });

  it('should abort if library prerelease version less than @skyux/packages version', async () => {
    mockSkyuxPackagesVersion = '6.1.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.1.1-beta.3',
    });

    expect(warningSpy).toHaveBeenCalledWith(
      "The '@skyux/foobar' package attempted to tag 'blackbaud/skyux-packages' with a version in the same range as (^5.0.0-beta.0) but a compatible version of '@skyux/packages' could not be found. Manually tag and release 'blackbaud/skyux-packages' with a version that is in the same range as '@skyux/foobar@^5.0.0-beta.0'."
    );
  });

  it('should abort if library major version is greater than @skyux/packages version', async () => {
    mockSkyuxPackagesVersion = '5.1.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '6.0.0',
    });

    expect(warningSpy).toHaveBeenCalledWith(
      "The '@skyux/foobar' package attempted to tag 'blackbaud/skyux-packages' with a version in the same range as (^6.0.0) but a compatible version of '@skyux/packages' could not be found. Manually tag and release 'blackbaud/skyux-packages' with a version that is in the same range as '@skyux/foobar@^6.0.0'."
    );
  });

  it('should abort if library major version is greater than @skyux/packages prerelease version', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0',
    });

    expect(warningSpy).toHaveBeenCalledWith(
      "The '@skyux/foobar' package attempted to tag 'blackbaud/skyux-packages' with a version in the same range as (^5.0.0) but a compatible version of '@skyux/packages' could not be found. Manually tag and release 'blackbaud/skyux-packages' with a version that is in the same range as '@skyux/foobar@^5.0.0'."
    );
  });

  it('should abort if library not listed in packageGroup', async () => {
    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/invalid',
      version: '5.0.0',
    });

    expect(warningSpy).toHaveBeenCalledWith(
      "Tagging 'blackbaud/skyux-packages' was aborted because the library '@skyux/invalid' is not listed in the `packageGroup` section of 'blackbaud/skyux-packages' package.json file."
    );
  });
});
