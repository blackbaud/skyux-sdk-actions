import * as core from '@actions/core';

import * as crossSpawn from 'cross-spawn';
import * as path from 'path';

import { spawn } from './spawn';

describe('spawn', () => {
  let infoSpy: jasmine.Spy;

  beforeEach(() => {
    infoSpy = spyOn(core, 'info');
  });

  it('should execute a child process', async (done: DoneFn) => {
    spyOn(core, 'getInput').and.returnValue('');

    const output = 'The command output.';

    spyOn(crossSpawn as any, 'spawn').and.callFake(() => {
      return {
        stdout: {
          on: (event: string, cb: (data: any) => void) => {
            cb(Buffer.from(output));
          },
        },
        on: (event: string, cb: (data: any) => void) => {
          if (event === 'exit') {
            cb(0);
          }
        },
      };
    });
    const result = await spawn('foo', ['bar', 'baz']);
    expect(result).toEqual(output);
    expect(infoSpy).toHaveBeenCalledWith(output);
    done();
  });

  it('should allow running in specific directory', async (done: DoneFn) => {
    spyOn(core, 'getInput').and.returnValue('MOCK_WORKING_DIRECTORY');

    let spawnOptionsCalled: any;

    spyOn(crossSpawn as any, 'spawn').and.callFake(
      (command: string, args: string[], options: any) => {
        spawnOptionsCalled = options;
        return {
          stdout: {
            on: (event: string, cb: (data: any) => void) => cb(''),
          },
          on: (event: string, cb: (data: any) => void) => {
            if (event === 'exit') {
              cb(0);
            }
          },
        };
      }
    );
    await spawn('foo', ['bar', 'baz']);
    expect(spawnOptionsCalled.cwd).toEqual(
      path.resolve(process.cwd(), 'MOCK_WORKING_DIRECTORY')
    );
    done();
  });

  it('should output errors from processes', async (done: DoneFn) => {
    spyOn(core, 'getInput').and.returnValue('');

    const errorMessage = 'The error message.';

    spyOn(crossSpawn as any, 'spawn').and.callFake(() => {
      return {
        stderr: {
          on: (event: string, cb: (data: any) => void) => {
            cb(Buffer.from(errorMessage));
          },
        },
        on: (event: string, cb: (data: any) => void) => {
          if (event === 'exit') {
            cb(1);
          }
        },
      };
    });

    spawn('foo', ['bar', 'baz']).catch((err) => {
      expect(err).toEqual(errorMessage);
      done();
    });
  });

  it('should output child_process errors', async (done: DoneFn) => {
    spyOn(core, 'getInput').and.returnValue('');

    const errorMessage = 'The error message.';

    spyOn(crossSpawn as any, 'spawn').and.callFake(() => {
      return {
        on: (event: string, cb: (data: any) => void) => {
          if (event === 'error') {
            cb(errorMessage);
          } else if (event === 'exit') {
            cb(1);
          }
        },
      };
    });

    spawn('foo', ['bar', 'baz']).catch((err) => {
      expect(err).toEqual(errorMessage);
      done();
    });
  });
});
