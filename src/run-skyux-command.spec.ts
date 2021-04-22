import {
  SkyUxCIPlatformConfig
} from './ci-platform-config';

import {
  runSkyUxCommand
} from './run-skyux-command';

import * as spawnModule from './spawn';

describe('Run SKY UX command', () => {

  let spawnSpy: jasmine.Spy;

  beforeEach(() => {
    spawnSpy = spyOn(spawnModule, 'spawn');
  });

  it('should run a SKY UX CLI command', async () => {
    await runSkyUxCommand('test');
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p', '@skyux-sdk/cli',
      'skyux', 'test',
      '--logFormat', 'none',
      '--platform', 'gh-actions'
    ]);
  });

  it('should allow passing arguments', async () => {
    await runSkyUxCommand('test', ['--my-arg', 'foobar']);
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p', '@skyux-sdk/cli',
      'skyux', 'test',
      '--logFormat', 'none',
      '--my-arg', 'foobar',
      '--platform', 'gh-actions'
    ]);
  });

  it('should allow unsetting the `platform` argument', async () => {
    await runSkyUxCommand('test', [], SkyUxCIPlatformConfig.None);
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p', '@skyux-sdk/cli',
      'skyux', 'test',
      '--logFormat', 'none',
      '--headless'
    ]);
  });

});
