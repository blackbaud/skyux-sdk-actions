import mock from 'mock-require';
import path from 'path';

describe('Run lifecycle hook', () => {
  let coreSpyObj: jasmine.SpyObj<any>;

  beforeEach(() => {
    coreSpyObj = jasmine.createSpyObj('core', [
      'getInput',
      'info',
      'setFailed',
    ]);

    coreSpyObj.getInput.and.callFake((key: string) => {
      if (key === 'working-directory') {
        return 'MOCK_WORKING_DIRECTORY';
      }

      if (key === 'my-lifecycle-hook') {
        return 'MOCK_LIFECYCLE_HOOK.js';
      }

      if (key === 'my-invalid-lifecycle-hook') {
        return 'INVALID_SCRIPT.js';
      }

      return '';
    });

    mock('@actions/core', coreSpyObj);

    mock(path.resolve('./MOCK_WORKING_DIRECTORY/MOCK_LIFECYCLE_HOOK.js'), {
      runAsync() {},
    });

    mock(path.resolve('./MOCK_WORKING_DIRECTORY/INVALID_SCRIPT.js'), {
      runAsync() {
        throw new Error('something bad happened');
      },
    });
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./run-lifecycle-hook');
  }

  it('should run a lifecycle hook', async () => {
    const { runLifecycleHook } = getUtil();
    await runLifecycleHook('my-lifecycle-hook');
    expect(coreSpyObj.info).toHaveBeenCalledWith(
      `Lifecycle hook 'my-lifecycle-hook' successfully executed.`,
    );
  });

  it('should not run the hook if it does not exist', async () => {
    const { runLifecycleHook } = getUtil();
    await runLifecycleHook('my-missing-lifecycle-hook');
    expect(coreSpyObj.info).not.toHaveBeenCalled();
  });

  it('should handle errors', async () => {
    spyOn(console, 'error');
    const { runLifecycleHook } = getUtil();
    await runLifecycleHook('my-invalid-lifecycle-hook');
    expect(coreSpyObj.setFailed).toHaveBeenCalledWith(
      `The lifecycle hook 'my-invalid-lifecycle-hook' was not found or was not exported correctly.`,
    );
  });
});
