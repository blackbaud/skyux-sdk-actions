import mock from 'mock-require';
import path from 'path';

describe('Chrome driver manager', () => {
  let spawnSpy: jasmine.Spy;

  beforeEach(() => {
    spyOn(console, 'log');

    mock('chromedriver-version-matcher', {
      getChromeDriverVersion: () => {
        return {};
      },
    });

    spawnSpy = jasmine.createSpy();

    mock('cross-spawn', {
      sync: spawnSpy,
    });
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./chromedriver-manager');
  }

  it('should run chrome webdriver manager', async () => {
    spawnSpy.and.returnValue({});

    const { updateChromeDriver } = getUtil();

    await updateChromeDriver();

    expect(spawnSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), 'node_modules/.bin/webdriver-manager'),
      [
        'update',
        '--standalone=false',
        '--gecko=false',
        '--versions.chrome',
        'latest',
      ],
      {
        stdio: 'inherit',
      }
    );
  });

  it('should handle errors', async () => {
    spawnSpy.and.returnValue({
      error: 'something bad happened',
    });

    const { updateChromeDriver } = getUtil();

    await expectAsync(updateChromeDriver()).toBeRejectedWith(
      'something bad happened'
    );
  });
});
