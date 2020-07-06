import * as core from '@actions/core';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as notifySlackModule from './notify-slack';
import * as spawnModule from './spawn';
import * as utils from './utils';

import {
  npmPublish
} from './npm-publish';

describe('npmPublish', () => {
  let infoSpy: jasmine.Spy;
  let failedLogSpy: jasmine.Spy;
  let writeSpy: jasmine.Spy;
  let slackSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let getTagSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'org/repo';

    spyOn(core, 'getInput').and.callFake((key: string) => {
      if (key === 'working-directory') {
        return 'MOCK_WORKING_DIRECTORY';
      } else if (key === 'npm-token') {
        return 'MOCK_TOKEN';
      }
      return '';
    });

    infoSpy = spyOn(core, 'info');
    failedLogSpy = spyOn(core, 'setFailed');

    spyOn(fsExtra, 'readJsonSync').and.returnValue({
      name: 'foo-package',
      version: '1.2.3'
    });
    spyOn(fsExtra, 'ensureFile');
    writeSpy = spyOn(fsExtra, 'writeFileSync');
    spyOn(fsExtra, 'removeSync');

    slackSpy = spyOn(notifySlackModule, 'notifySlack');

    spawnSpy = spyOn(spawnModule, 'spawn');

    getTagSpy = spyOn(utils, 'getTag').and.returnValue('1.0.0');
  });

  afterEach(() => {
    process.env.GITHUB_REPOSITORY = undefined;
  });

  it('should publish to NPM', async (done: DoneFn) => {
    await npmPublish();

    expect(writeSpy).toHaveBeenCalledWith(
      `${path.join(process.cwd(), core.getInput('working-directory'), 'dist', '.npmrc')}`,
      '//registry.npmjs.org/:_authToken=MOCK_TOKEN'
    );

    expect(infoSpy).toHaveBeenCalledWith('Successfully published foo-package@1.2.3 to NPM.');
    expect(slackSpy).toHaveBeenCalledWith('Successfully published foo-package@1.2.3 to NPM.\nhttps://github.com/org/repo/blob/1.2.3/CHANGELOG.md');
    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'latest'],
      { cwd: path.join(process.cwd(), core.getInput('working-directory'), 'dist') }
    );

    done();
  });

  it('should publish using the `next` tag', async (done: DoneFn) => {
    getTagSpy.and.callThrough();
    getTagSpy.and.returnValue('1.0.0-rc.0');

    await npmPublish();

    expect(spawnSpy).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'next'],
      { cwd: path.join(process.cwd(), core.getInput('working-directory'), 'dist') }
    );

    done();
  });

  it('should handle errors', async (done: DoneFn) => {
    spawnSpy.and.throwError('Something bad happened.');
    await npmPublish();
    expect(failedLogSpy).toHaveBeenCalledWith('Something bad happened.');
    expect(failedLogSpy).toHaveBeenCalledWith('foo-package@1.2.3 failed to publish to NPM.');
    expect(slackSpy).toHaveBeenCalledWith('foo-package@1.2.3 failed to publish to NPM.');
    done();
  });

});
