import mock from 'mock-require';
import path from 'path';

describe('Tag `@skyux/packages`', () => {
  let cloneRepoAsAdminSpy: jasmine.Spy;
  let fsSpyObj: jasmine.SpyObj<any>;
  let mockSkyuxPackagesCheckoutVersion: string;
  let mockSkyuxPackagesVersion: string;
  let spawnSpy: jasmine.Spy;
  let readJsonSyncCounter: number;
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
    mockSkyuxPackagesVersion = '2.0.0';
    mockSkyuxPackagesCheckoutVersion = '1.0.0';

    fsSpyObj.readJsonSync.and.callFake(() => {
      let packageJson: any = {
        version: mockSkyuxPackagesVersion,
      };

      // The first time package.json is read return what's in the master branch.
      // Subsequent reads will be from another major-version specific branch (e.g. `4.x.x`).
      if (readJsonSyncCounter > 0) {
        packageJson = {
          version: mockSkyuxPackagesCheckoutVersion,
        };
      }

      readJsonSyncCounter++;

      return packageJson;
    });

    spawnSpy = jasmine.createSpy('spawn');

    spawnSpy.and.callFake(() => {
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

  it('should update and commit the changelog/package.json to blackbaud/skyux-packages repo', async () => {
    mockSkyuxPackagesVersion = '1.0.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '1.0.0',
    });

    expect(cloneRepoAsAdminSpy).toHaveBeenCalledWith(
      'https://MOCK_TOKEN@github.com/skyux-packages.git',
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
      { version: '1.0.1' },
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

  it('should tag prerelease versions in the same release group', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0-alpha.15',
    });

    verifySpawn('git', ['tag', '5.0.0-alpha.1']);
  });

  it('should tag releases for older major versions', async () => {
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

  it('should abort if library prerelease version not in same group as @skyux/packages prerelease version', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.3';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0-beta.3',
    });

    expect(warningSpy).toHaveBeenCalledWith('Something bad happened.');
  });

  it('should abort if library prerelease version older than @skyux/packages major version', async () => {
    mockSkyuxPackagesVersion = '6.1.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.1.1-beta.3',
    });

    expect(warningSpy).toHaveBeenCalledWith('Something bad happened.');
  });

  it('should abort if library major version is greater than @skyux/packages version', async () => {
    mockSkyuxPackagesVersion = '5.1.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '6.0.0',
    });

    expect(warningSpy).toHaveBeenCalledWith('Something bad happened.');
  });

  it('should abort if library major version is greater than @skyux/packages prerelease version', async () => {
    mockSkyuxPackagesVersion = '5.0.0-alpha.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '5.0.0',
    });

    expect(warningSpy).toHaveBeenCalledWith('Something bad happened.');
  });
});
