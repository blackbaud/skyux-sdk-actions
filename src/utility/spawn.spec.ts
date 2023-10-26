import mock from 'mock-require';
import path from 'path';

describe('spawn', () => {
  let coreSpyObj: jasmine.SpyObj<any>;
  let crossSpawnSpy: jasmine.Spy;
  let mockChildProcess: any;
  let mockStdout: string;
  let mockWorkingDirectory: string;

  beforeEach(() => {
    mockWorkingDirectory = '';

    coreSpyObj = jasmine.createSpyObj('core', ['getInput', 'info']);

    coreSpyObj.getInput.and.callFake((key: string) => {
      return key === 'working-directory' ? mockWorkingDirectory : '';
    });

    mockStdout = '';
    mockChildProcess = {
      stdout: {
        on: (_event: string, cb: (data: any) => void) => {
          cb(Buffer.from(mockStdout));
        },
      },
      on: (event: string, cb: (data: any) => void) => {
        if (event === 'exit') {
          cb(0);
        }
      },
    };

    crossSpawnSpy = jasmine.createSpy('spawn').and.callFake(() => {
      return mockChildProcess;
    });

    mock('cross-spawn', {
      spawn: crossSpawnSpy,
    });

    mock('@actions/core', coreSpyObj);
  });

  afterEach(() => {
    mock.stopAll();
  });

  function getUtil() {
    return mock.reRequire('./spawn');
  }

  it('should execute a child process', async () => {
    mockStdout = 'The command output.';

    const { spawn } = getUtil();

    const result = await spawn('foo', ['bar', 'baz']);

    expect(crossSpawnSpy).toHaveBeenCalledWith('foo', ['bar', 'baz'], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    expect(result).toEqual(mockStdout);
    expect(coreSpyObj.info).toHaveBeenCalledWith(mockStdout);
  });

  it('should allow running in specific directory', async () => {
    mockWorkingDirectory = 'MOCK_WORKING_DIRECTORY';

    const { spawn } = getUtil();

    await spawn('foo', ['bar', 'baz']);

    expect(crossSpawnSpy).toHaveBeenCalledWith('foo', ['bar', 'baz'], {
      stdio: 'pipe',
      cwd: path.join(process.cwd(), 'MOCK_WORKING_DIRECTORY'),
    });
  });

  it('should output errors from processes', async () => {
    const errorMessage = 'The error message.';

    delete mockChildProcess.stdout;

    mockChildProcess.stderr = {
      on: (_event: string, cb: (data: any) => void) => {
        cb(Buffer.from(errorMessage));
      },
    };

    mockChildProcess.on = (event: string, cb: (data: any) => void) => {
      if (event === 'exit') {
        cb(1);
      }
    };

    const { spawn } = getUtil();

    await expectAsync(spawn('foo', ['bar', 'baz'])).toBeRejectedWith(errorMessage);
  });

  it('should output child_process errors', async () => {
    const errorMessage = 'The error message.';

    mockChildProcess.on = (event: string, cb: (data: any) => void) => {
      if (event === 'error') {
        cb(errorMessage);
      } else if (event === 'exit') {
        cb(1);
      }
    };

    const { spawn } = getUtil();

    await expectAsync(spawn('foo', ['bar', 'baz'])).toBeRejectedWith(errorMessage);
  });
});
