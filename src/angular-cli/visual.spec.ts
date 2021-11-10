import mock from 'mock-require';
import path from 'path';

describe('visual tests', () => {
  let chromeDriverManagerSpy: jasmine.Spy;
  let coreSpyObj: jasmine.SpyObj<any>;
  let e2eDirectoryExists: boolean;
  let fsExtraSpyObj: jasmine.SpyObj<any>;
  let mockAngularJson: any;
  let screenshotComparatorSpyObj: jasmine.SpyObj<any>;
  let spawnSpy: jasmine.Spy;
  let utilsSpyObj: jasmine.SpyObj<any>;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(console, 'error');

    e2eDirectoryExists = true;

    mockAngularJson = {
      projects: {
        'my-lib': {
          root: 'projects/my-lib',
        },
        'my-lib-showcase': {
          root: 'projects/my-lib-showcase',
        },
      },
      defaultProject: 'my-lib',
    };

    coreSpyObj = jasmine.createSpyObj('core', [
      'getInput',
      'info',
      'setFailed',
      'warning',
    ]);

    coreSpyObj.getInput.and.callFake((name: string) => {
      return `MOCK_${name.toLocaleUpperCase()}`;
    });

    mock('@actions/core', coreSpyObj);

    fsExtraSpyObj = jasmine.createSpyObj('fs-extra', ['existsSync']);

    fsExtraSpyObj.existsSync.and.callFake((filePath: string) => {
      if (filePath.includes('e2e')) {
        return e2eDirectoryExists;
      }

      return false;
    });

    mock('fs-extra', fsExtraSpyObj);

    screenshotComparatorSpyObj = jasmine.createSpyObj('screenshot-comparator', [
      'checkNewBaselineScreenshots',
      'checkNewFailureScreenshots',
    ]);
    mock('../screenshot-comparator', screenshotComparatorSpyObj);

    spawnSpy = jasmine.createSpy('spawn');
    mock('../spawn', {
      spawn: spawnSpy,
    });

    utilsSpyObj = jasmine.createSpyObj('utils', [
      'isPullRequest',
      'isPush',
      'isTag',
    ]);
    mock('../utils', utilsSpyObj);

    chromeDriverManagerSpy = jasmine.createSpy('updateChromeDriver');

    mock('./chromedriver-manager', {
      updateChromeDriver: chromeDriverManagerSpy,
    });
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./visual');
  }

  it('should run visual tests', async () => {
    const { visual } = getUtil();
    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(spawnSpy).toHaveBeenCalledWith('node', [
      path.join(
        './node_modules/@skyux-sdk/pipeline-settings/test-runners/protractor.js'
      ),
      '--platform=gh-actions',
      '--project-name=my-lib-showcase',
      '--project-root=MOCK_WORKING-DIRECTORY/projects/my-lib-showcase',
    ]);
  });

  it('should abort visual tests if e2e directory not found', async () => {
    e2eDirectoryExists = false;

    const { visual } = getUtil();
    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(coreSpyObj.warning).toHaveBeenCalledWith(
      'Skipping visual tests because "MOCK_WORKING-DIRECTORY/projects/my-lib-showcase/e2e" was not found.'
    );
  });

  it('should abort visual tests if showcase app not found', async () => {
    delete mockAngularJson.projects['my-lib-showcase'];

    const { visual } = getUtil();
    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(coreSpyObj.warning).toHaveBeenCalledWith(
      'Skipping visual tests because a project named "my-lib-showcase" was not found in the workspace configuration.'
    );
  });

  it('should handle errors when running visual tests', async () => {
    const { visual } = getUtil();

    spawnSpy.and.callFake((command: string, args: string[]) => {
      if (command === 'node' && args.join('').includes('protractor')) {
        throw new Error('something bad happened');
      }
    });
    spyOn(process, 'exit');

    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
      'End-to-end tests failed.'
    );
  });

  it('should check baselines on a push', async () => {
    utilsSpyObj.isPush.and.returnValue(true);

    const { visual } = getUtil();

    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(
      screenshotComparatorSpyObj.checkNewBaselineScreenshots
    ).toHaveBeenCalledWith('org/repo', 'BUILD_ID');
  });

  it('should commit failure screenshots for pull requests', async () => {
    utilsSpyObj.isPullRequest.and.returnValue(true);

    const { visual } = getUtil();

    spawnSpy.and.callFake((command: string, args: string[]) => {
      if (command === 'node' && args.join('').includes('protractor')) {
        throw new Error('something bad happened');
      }
    });

    spyOn(process, 'exit');

    await visual('BUILD_ID', 'my-lib-showcase', mockAngularJson);

    expect(
      screenshotComparatorSpyObj.checkNewFailureScreenshots
    ).toHaveBeenCalledWith('BUILD_ID');
  });
});
