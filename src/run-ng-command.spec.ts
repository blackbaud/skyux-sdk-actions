import mock from 'mock-require';

describe('Run lifecycle hook', () => {
  let coreSpyObj: jasmine.SpyObj<any>;
  let spawnSpy: jasmine.Spy;

  beforeEach(() => {
    coreSpyObj = jasmine.createSpyObj('core', ['info']);

    mock('@actions/core', coreSpyObj);

    spawnSpy = jasmine.createSpy('spawn');

    mock('./spawn', {
      spawn: spawnSpy,
    });
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./run-ng-command');
  }

  it('should run Angular CLI commands', async () => {
    const { runNgCommand } = getUtil();
    await runNgCommand('new');
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p',
      '@angular/cli',
      'ng',
      'new',
    ]);
  });

  it('should support CLI arguments', async () => {
    const { runNgCommand } = getUtil();
    await runNgCommand('new', ['my-app']);
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p',
      '@angular/cli',
      'ng',
      'new',
      'my-app',
    ]);
  });
});
