import mock from 'mock-require';

describe('Validate dependencies', () => {
  let coreSpyObj: jasmine.SpyObj<any>;
  let fsExtraSpyObj: jasmine.SpyObj<any>;

  let mockProjectPackageJson: any;
  let mockPackageJson: any;

  beforeEach(() => {
    mockProjectPackageJson = {};
    mockPackageJson = {};

    spyOn(process, 'exit');
    spyOn(console, 'error');

    coreSpyObj = jasmine.createSpyObj('core', [
      'error',
      'getInput',
      'info',
      'setFailed',
    ]);

    coreSpyObj.getInput.and.callFake((name: string) => {
      return `MOCK_${name.toLocaleUpperCase()}`;
    });

    mock('@actions/core', coreSpyObj);

    fsExtraSpyObj = jasmine.createSpyObj('fs-extra', ['readJsonSync']);

    fsExtraSpyObj.readJsonSync.and.callFake((filePath: string) => {
      if (filePath.includes('projects')) {
        return mockProjectPackageJson;
      }

      return mockPackageJson;
    });

    mock('fs-extra', fsExtraSpyObj);
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./validate-dependencies');
  }

  it('should log error if version in root dependencies is a range', async () => {
    mockPackageJson = {
      dependencies: {
        foobar: '^5.6.1',
      },
    };

    mockProjectPackageJson = {
      peerDependencies: {
        foobar: '^5.1.0',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.error).toHaveBeenCalledWith(
      `The version listed in 'package.json' for "foobar@^5.6.1" must be set to a specific version ` +
        `(without a semver range character), and set to the minimum version satisfied by the range ` +
        `defined in the \`peerDependencies\` section of 'projects/my-lib/package.json' (wanted "foobar@^5.1.0"). ` +
        `To address this problem, set "foobar" to (5.1.0) in the root 'package.json'.`,
    );
  });

  it('should log error if dependency missing from root package.json', async () => {
    mockPackageJson = {
      dependencies: {},
    };

    mockProjectPackageJson = {
      peerDependencies: {
        foobar: '^5.1.0',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.error).toHaveBeenCalledWith(
      `The package "foobar" listed in the \`peerDependencies\` section of 'projects/my-lib/package.json' was not found in the root 'package.json' \`dependencies\` section. Install the package at the root level and try again.`,
    );
  });

  it('should log error if version in root dependencies is greater than the minimum supported version in library peer dependencies', async () => {
    mockPackageJson = {
      dependencies: {
        foobar: '5.6.1',
      },
    };

    mockProjectPackageJson = {
      peerDependencies: {
        foobar: '^5.1.0',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.error).toHaveBeenCalledWith(
      `The version (5.6.1) of the package "foobar" in the \`dependencies\` section of 'package.json' does not ` +
        `meet the minimum version requirements of the range defined in the \`peerDependencies\` section of ` +
        `'projects/my-lib/package.json' (wanted "foobar@^5.1.0"). Either increase the minimum supported version ` +
        `in 'projects/my-lib/package.json' to (^5.6.1), or downgrade the version installed in the root 'package.json' to (5.1.0).`,
    );
  });

  it('should log error if version in root dependencies is greater than the minimum supported version in library dependencies', async () => {
    mockPackageJson = {
      dependencies: {
        foobar: '5.6.1',
      },
    };

    mockProjectPackageJson = {
      dependencies: {
        foobar: '^5.1.0',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.error).toHaveBeenCalledWith(
      `The version (5.6.1) of the package "foobar" in the \`dependencies\` section of 'package.json' does not ` +
        `meet the minimum version requirements of the range defined in the \`dependencies\` section of ` +
        `'projects/my-lib/package.json' (wanted "foobar@^5.1.0"). Either increase the minimum supported version ` +
        `in 'projects/my-lib/package.json' to (^5.6.1), or downgrade the version installed in the root 'package.json' to (5.1.0).`,
    );
  });

  it('should log if versions pass validation', async () => {
    mockPackageJson = {
      dependencies: {
        foobar: '5.1.0',
      },
    };

    mockProjectPackageJson = {
      peerDependencies: {
        foobar: '^5.1.0',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.info).toHaveBeenCalledWith(
      'Done validating dependencies. OK.',
    );
  });

  it('should handle complex semver ranges', async () => {
    mockPackageJson = {
      dependencies: {
        foobar: '5.0.0',
      },
    };

    mockProjectPackageJson = {
      peerDependencies: {
        foobar: '^5 || ^6 || ^7',
      },
    };

    const { validateDependencies } = getUtil();
    await validateDependencies('my-lib');

    expect(coreSpyObj.info).toHaveBeenCalledWith(
      'Done validating dependencies. OK.',
    );
  });
});
