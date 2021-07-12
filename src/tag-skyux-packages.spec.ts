import mock from 'mock-require';
import path from 'path';

describe('Tag `@skyux/packages`', () => {
  let cloneRepoAsAdminSpy: jasmine.Spy;
  let fsSpyObj: jasmine.SpyObj<any>;
  let mockSkyuxPackagesVersion: string;
  let spawnSpy: jasmine.Spy;

  beforeEach(() => {
    mockSkyuxPackagesVersion = '1.0.0';

    fsSpyObj = jasmine.createSpyObj('fs-extra', [
      'readFileSync',
      'readJsonSync',
      'writeFileSync',
      'writeJsonSync',
    ]);

    fsSpyObj.readFileSync.and.callFake(() => {
      return Buffer.from('ORIGINAL_CHANGELOG_CONTENT\n');
    });

    fsSpyObj.readJsonSync.and.callFake(() => {
      return {
        version: mockSkyuxPackagesVersion,
      };
    });

    spawnSpy = jasmine.createSpy('spawn');

    cloneRepoAsAdminSpy = jasmine.createSpy('cloneRepoAsAdmin');

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

    expect(fsSpyObj.writeFileSync).toHaveBeenCalledWith(
      path.join('mock-working-directory/.skyuxpackagestemp/CHANGELOG.md'),
      `# 1.0.1 (7/12/2021)

- \`@skyux/foobar@1.0.0\` [Release notes](https://changelog.com)

ORIGINAL_CHANGELOG_CONTENT
`,
      { encoding: 'utf-8' }
    );

    expect(fsSpyObj.writeJsonSync).toHaveBeenCalledWith(
      path.join('mock-working-directory/.skyuxpackagestemp/package.json'),
      { version: '1.0.1' }
    );

    verifySpawn('git', ['add', '.']);
    verifySpawn('git', [
      'commit',
      '-m',
      'Updated changelog/package.json for 1.0.1 release',
    ]);
    verifySpawn('git', ['push', 'origin', 'master']);
  });

  it('should tag a release', async () => {
    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '1.0.0',
    });

    verifySpawn('git', ['tag', '1.0.1']);
    verifySpawn('git', ['push', 'origin', '1.0.1']);
  });

  it('should update prerelease versions', async () => {
    mockSkyuxPackagesVersion = '3.0.0-alpha.0';

    const { tagSkyuxPackages } = getUtil();

    await tagSkyuxPackages({
      changelogUrl: 'https://changelog.com',
      name: '@skyux/foobar',
      version: '1.0.0',
    });

    expect(fsSpyObj.writeJsonSync).toHaveBeenCalledWith(
      path.join('mock-working-directory/.skyuxpackagestemp/package.json'),
      { version: '3.0.0-alpha.1' }
    );

    verifySpawn('git', ['tag', '3.0.0-alpha.1']);
  });
});
