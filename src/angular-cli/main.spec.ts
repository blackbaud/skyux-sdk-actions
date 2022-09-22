import mock from 'mock-require';
import path from 'path';

describe('Angular CLI main', () => {
  let coreSpyObj: jasmine.SpyObj<any>;
  let doValidateDependencies: 'true' | 'false';
  let fsExtraSpyObj: jasmine.SpyObj<any>;
  let isBrowserStackProjectDefined: boolean;
  let mockAngularJson: any;
  let mockGlobResults: string[];
  let mockPackageJson: any;
  let npmPublishSpy: jasmine.Spy;
  let packageLockExists: boolean;
  let runLifecycleHookSpy: jasmine.Spy;
  let runNgCommandSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let tagSkyuxPackagesSpy: jasmine.Spy;
  let utilsSpyObj: jasmine.SpyObj<any>;
  let validateDependenciesSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(console, 'error');

    coreSpyObj = jasmine.createSpyObj('core', [
      'getInput',
      'info',
      'setFailed',
      'warning',
    ]);

    isBrowserStackProjectDefined = true;
    doValidateDependencies = 'true';

    coreSpyObj.getInput.and.callFake((name: string) => {
      if (name === 'browser-stack-project' && !isBrowserStackProjectDefined) {
        return;
      }

      if (name === 'validate-dependencies') {
        return doValidateDependencies;
      }

      return `MOCK_${name.toLocaleUpperCase()}`;
    });

    mock('@actions/core', coreSpyObj);

    fsExtraSpyObj = jasmine.createSpyObj('fs-extra', [
      'existsSync',
      'readJsonSync',
    ]);

    packageLockExists = true;

    fsExtraSpyObj.existsSync.and.callFake((filePath: string) => {
      if (filePath.includes('package-lock.json')) {
        return packageLockExists;
      }

      return false;
    });

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

    mockPackageJson = {
      dependencies: {},
      devDependencies: {},
    };

    fsExtraSpyObj.readJsonSync.and.callFake((filePath: string) => {
      const basename = path.basename(filePath);
      if (basename === 'angular.json') {
        return mockAngularJson;
      }

      if (basename === 'package.json') {
        return mockPackageJson;
      }
    });

    mock('fs-extra', fsExtraSpyObj);

    mockGlobResults = ['foo.spec.ts'];

    mock('glob', {
      sync: () => {
        return mockGlobResults;
      },
    });

    npmPublishSpy = jasmine.createSpy('npmPublish');
    mock('../npm-publish', {
      npmPublish: npmPublishSpy,
    });

    runLifecycleHookSpy = jasmine.createSpy('runLifecycleHook');
    mock('../run-lifecycle-hook', {
      runLifecycleHook: runLifecycleHookSpy,
    });

    runNgCommandSpy = jasmine.createSpy('runNgCommand');
    mock('../run-ng-command', {
      runNgCommand: runNgCommandSpy,
    });

    spawnSpy = jasmine.createSpy('spawn');
    mock('../spawn', {
      spawn: spawnSpy,
    });

    tagSkyuxPackagesSpy = jasmine.createSpy('tagSkyuxPackages');
    mock('../tag-skyux-packages', {
      tagSkyuxPackages: tagSkyuxPackagesSpy,
    });

    utilsSpyObj = jasmine.createSpyObj('utils', [
      'isPullRequest',
      'isPush',
      'isTag',
    ]);
    mock('../utils', utilsSpyObj);

    validateDependenciesSpy = jasmine.createSpy('validateDependencies');

    mock('./validate-dependencies', {
      validateDependencies: validateDependenciesSpy,
    });
  });

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY;
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./main');
  }

  it('should run `npm ci` if package-lock exists', async () => {
    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();
    expect(spawnSpy).toHaveBeenCalledWith('npm', ['ci']);
  });

  it('should run `npm install` if package-lock not found', async () => {
    packageLockExists = false;
    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();
    expect(spawnSpy).toHaveBeenCalledWith('npm', ['install']);
  });

  it('should handle installation errors', async () => {
    spawnSpy.and.throwError(new Error('something bad happened'));
    spyOn(process, 'exit');

    const { executeAngularCliSteps } = getUtil();

    await executeAngularCliSteps();

    expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
      'Packages installation failed.'
    );
  });

  it('should run lifecycle hooks', async () => {
    const { executeAngularCliSteps } = getUtil();

    await executeAngularCliSteps();

    expect(runLifecycleHookSpy.calls.allArgs()).toEqual([
      ['hook-before-script'],
      ['hook-after-build-public-library-success'],
      ['hook-after-code-coverage-success'],
    ]);
  });

  it('should build the library', async () => {
    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();
    expect(runNgCommandSpy).toHaveBeenCalledWith('build', [
      'my-lib',
      '--configuration=production',
    ]);
  });

  it('should handle errors when building the library', async () => {
    const { executeAngularCliSteps } = getUtil();

    runNgCommandSpy.and.throwError(new Error('something bad happened'));
    spyOn(process, 'exit');

    await executeAngularCliSteps();

    expect(coreSpyObj.setFailed).toHaveBeenCalledWith('Library build failed.');
  });

  it('should generate documentation.json if schematics installed', async () => {
    mockPackageJson.devDependencies['@skyux-sdk/documentation-schematics'] =
      '1.0.0';

    const { executeAngularCliSteps } = getUtil();

    await executeAngularCliSteps();

    expect(runNgCommandSpy).toHaveBeenCalledWith('generate', [
      '@skyux-sdk/documentation-schematics:documentation',
    ]);
  });

  it('should validate dependencies', async () => {
    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();
    expect(validateDependenciesSpy).toHaveBeenCalledWith('my-lib');
  });

  it('should not validate dependencies if "validate-dependencies" is set to "false"', async () => {
    doValidateDependencies = 'false';
    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();
    expect(validateDependenciesSpy).not.toHaveBeenCalled();
  });

  describe('code coverage', () => {
    it('should run code coverage', async () => {
      const { executeAngularCliSteps } = getUtil();
      await executeAngularCliSteps();

      expect(spawnSpy).toHaveBeenCalledWith('node', [
        path.join(
          './node_modules/@skyux-sdk/pipeline-settings/test-runners/karma.js'
        ),
        '--platform=gh-actions',
        '--project-name=my-lib',
        '--browserstack-username=MOCK_BROWSER-STACK-USERNAME',
        '--browserstack-access-key=MOCK_BROWSER-STACK-ACCESS-KEY',
        '--browserstack-build-id=BUILD_ID-coverage',
        '--browserstack-project=MOCK_BROWSER-STACK-PROJECT',
        '--code-coverage-browser-set=MOCK_CODE-COVERAGE-BROWSER-SET',
        '--code-coverage-threshold-branches=MOCK_CODE-COVERAGE-THRESHOLD-BRANCHES',
        '--code-coverage-threshold-functions=MOCK_CODE-COVERAGE-THRESHOLD-FUNCTIONS',
        '--code-coverage-threshold-lines=MOCK_CODE-COVERAGE-THRESHOLD-LINES',
        '--code-coverage-threshold-statements=MOCK_CODE-COVERAGE-THRESHOLD-STATEMENTS',
      ]);
    });

    it('should handle errors when running code coverage', async () => {
      const { executeAngularCliSteps } = getUtil();

      spawnSpy.and.callFake((command: string) => {
        if (command === 'node') {
          throw new Error('something bad happened');
        }
      });
      spyOn(process, 'exit');

      await executeAngularCliSteps();

      expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
        'Code coverage failed.'
      );
    });

    it('should default "browser-stack-project" to the GitHub repository if undefined', async () => {
      isBrowserStackProjectDefined = false;

      const { executeAngularCliSteps } = getUtil();

      await executeAngularCliSteps();

      expect(spawnSpy).toHaveBeenCalledWith('node', [
        path.join(
          './node_modules/@skyux-sdk/pipeline-settings/test-runners/karma.js'
        ),
        '--platform=gh-actions',
        '--project-name=my-lib',
        '--browserstack-username=MOCK_BROWSER-STACK-USERNAME',
        '--browserstack-access-key=MOCK_BROWSER-STACK-ACCESS-KEY',
        '--browserstack-build-id=BUILD_ID-coverage',
        '--browserstack-project=org/repo',
        '--code-coverage-browser-set=MOCK_CODE-COVERAGE-BROWSER-SET',
        '--code-coverage-threshold-branches=MOCK_CODE-COVERAGE-THRESHOLD-BRANCHES',
        '--code-coverage-threshold-functions=MOCK_CODE-COVERAGE-THRESHOLD-FUNCTIONS',
        '--code-coverage-threshold-lines=MOCK_CODE-COVERAGE-THRESHOLD-LINES',
        '--code-coverage-threshold-statements=MOCK_CODE-COVERAGE-THRESHOLD-STATEMENTS',
      ]);
    });

    it('should abort if no specs', async () => {
      mockGlobResults = [];

      const { executeAngularCliSteps } = getUtil();

      await executeAngularCliSteps();

      expect(coreSpyObj.warning).toHaveBeenCalledWith(
        'Skipping code coverage because spec files were not found.'
      );
    });
  });

  it('should release tags', async () => {
    utilsSpyObj.isTag.and.returnValue(true);
    npmPublishSpy.and.returnValue({});

    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();

    expect(npmPublishSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), 'MOCK_WORKING-DIRECTORY/dist/my-lib')
    );

    expect(tagSkyuxPackagesSpy).toHaveBeenCalledWith({});
  });
});
