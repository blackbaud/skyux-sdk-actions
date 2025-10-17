import mock from 'mock-require';
import path from 'path';

describe('Angular CLI main', () => {
  let coreSpyObj: jasmine.SpyObj<any>;
  let doValidateDependencies: 'true' | 'false';
  let fsExtraSpyObj: jasmine.SpyObj<any>;
  let mockAngularJson: any;
  let mockBrowserSet = 'paranoid';
  let mockGlobResults: string[];
  let mockPackageJson: any;
  let npmPublishSpy: jasmine.Spy;
  let packageLockExists: boolean;
  let runLifecycleHookSpy: jasmine.Spy;
  let runNgCommandSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let utilsSpyObj: jasmine.SpyObj<any>;
  let validateDependenciesSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(process, 'exit');

    spyOn(console, 'error');
    spyOn(console, 'info');

    coreSpyObj = jasmine.createSpyObj('core', [
      'exportVariable',
      'getInput',
      'info',
      'setFailed',
      'warning',
    ]);

    doValidateDependencies = 'true';
    mockBrowserSet = 'paranoid';

    coreSpyObj.getInput.and.callFake((name: string) => {
      if (name === 'validate-dependencies') {
        return doValidateDependencies;
      }
      if (name === 'code-coverage-browser-set') {
        return mockBrowserSet;
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
    mock('./utility/npm-publish', {
      npmPublish: npmPublishSpy,
    });

    runLifecycleHookSpy = jasmine.createSpy('runLifecycleHook');
    mock('./utility/run-lifecycle-hook', {
      runLifecycleHook: runLifecycleHookSpy,
    });

    runNgCommandSpy = jasmine.createSpy('runNgCommand');
    mock('./utility/run-ng-command', {
      runNgCommand: runNgCommandSpy,
    });

    spawnSpy = jasmine.createSpy('spawn').and.resolveTo();
    mock('./utility/spawn', {
      spawn: spawnSpy,
    });

    utilsSpyObj = jasmine.createSpyObj('utils', [
      'isPullRequest',
      'isPush',
      'isTag',
    ]);
    mock('./utility/context', utilsSpyObj);

    validateDependenciesSpy = jasmine.createSpy('validateDependencies');

    mock('./utility/validate-dependencies', {
      validateDependencies: validateDependenciesSpy,
    });
  });

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY;
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./execute-angular-cli-steps');
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

    const { executeAngularCliSteps } = getUtil();

    await executeAngularCliSteps();

    expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
      'Packages installation failed.',
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
      '--project=MOCK_PROJECT',
      '--configuration=production',
    ]);
  });

  it('should handle errors when building the library', async () => {
    const { executeAngularCliSteps } = getUtil();

    runNgCommandSpy.and.throwError(new Error('something bad happened'));

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
    expect(validateDependenciesSpy).toHaveBeenCalledWith('MOCK_PROJECT');
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

      expect(runNgCommandSpy).toHaveBeenCalledWith('test', [
        '--karma-config=./node_modules/@skyux-sdk/pipeline-settings/platforms/gh-actions/karma/karma.angular-cli.conf.js',
        '--progress=false',
        '--project=MOCK_PROJECT',
        '--source-map',
        '--watch=false',
      ]);
    });

    it('should handle errors when running code coverage', async () => {
      const { executeAngularCliSteps } = getUtil();

      runNgCommandSpy.and.callFake((command: string) => {
        if (command === 'test') {
          throw new Error('something bad happened');
        }
      });

      await executeAngularCliSteps();

      expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
        'Code coverage failed.',
      );
    });

    it('should abort if no specs', async () => {
      mockGlobResults = [];

      const { executeAngularCliSteps } = getUtil();

      await executeAngularCliSteps();

      expect(coreSpyObj.warning).toHaveBeenCalledWith(
        'Skipping code coverage because spec files were not found.',
      );
    });

    it('should skip playwright install-deps for speedy', async () => {
      mockBrowserSet = 'speedy';

      const { executeAngularCliSteps } = getUtil();

      await executeAngularCliSteps();

      expect(spawnSpy).not.toHaveBeenCalledWith('npx', [
        'playwright',
        'install-deps',
      ]);
    });

    it('should keep going if playwright install-deps fails', async () => {
      spawnSpy.and.callFake((command: string, args: string[]) => {
        if (command === 'npx' && args[0] === 'playwright') {
          return Promise.reject(new Error('something bad happened'));
        }
        return Promise.resolve();
      });

      const { executeAngularCliSteps } = getUtil();

      await executeAngularCliSteps();

      expect(runLifecycleHookSpy.calls.allArgs()).toEqual([
        ['hook-before-script'],
        ['hook-after-build-public-library-success'],
        ['hook-after-code-coverage-success'],
      ]);
    });
  });

  it('should publish', async () => {
    utilsSpyObj.isTag.and.returnValue(true);
    npmPublishSpy.and.returnValue({});

    const { executeAngularCliSteps } = getUtil();
    await executeAngularCliSteps();

    expect(npmPublishSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), 'MOCK_WORKING-DIRECTORY/dist/MOCK_PROJECT'),
    );
  });
});
