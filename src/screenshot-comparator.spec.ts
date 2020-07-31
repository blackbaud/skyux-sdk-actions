import * as core from '@actions/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as rimraf from 'rimraf';

import * as directoryHasChangesModule from './directory-has-changes';
import * as spawnModule from './spawn';

import {
  checkNewBaselineScreenshots, checkNewFailureScreenshots
} from './screenshot-comparator';

describe('screenshot comparator', () => {
  let failedLogSpy: jasmine.Spy;
  let infoSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let visualBaselinesBranch: string;

  beforeEach(() => {
    spyOn(rimraf, 'sync');
    spyOn(fs, 'copy');
    spyOn(process, 'exit');
    visualBaselinesBranch = '';
    spyOn(core, 'getInput').and.callFake((key: string) => {
      switch (key) {
        case 'working-directory':
          return 'MOCK_WORKING_DIRECTORY';
        case 'github-token':
          return 'MOCK_GITHUB_TOKEN';
        case 'visual-baselines-branch':
          return visualBaselinesBranch;
        default:
          return '';
      }
    });
    failedLogSpy = spyOn(core, 'setFailed');
    infoSpy = spyOn(core, 'info');
    spawnSpy = spyOn(spawnModule, 'spawn');
  });

  describe('checkNewBaselineScreenshots', () => {
    it('should check for new baseline screenshots', async (done: DoneFn) => {
      spyOn(directoryHasChangesModule, 'directoryHasChanges').and.returnValue(Promise.resolve(true));
      await checkNewBaselineScreenshots('foo-repo', 'build-id');
      expect(spawnSpy).toHaveBeenCalledWith('git', ['clone', 'https://MOCK_GITHUB_TOKEN@github.com/foo-repo.git', '--branch', 'master', '--single-branch', '.skypagesvisualbaselinetemp']);
      expect(spawnSpy).toHaveBeenCalledWith('git', ['push', '--force', '--quiet', 'origin', 'master'], {
        cwd: path.resolve('MOCK_WORKING_DIRECTORY', '.skypagesvisualbaselinetemp')
      });
      expect(infoSpy).toHaveBeenCalledWith('New screenshots detected.');
      expect(infoSpy).toHaveBeenCalledWith('Preparing to commit baseline screenshots to the \'master\' branch.');
      expect(infoSpy).toHaveBeenCalledWith('New baseline images saved.');
      done();
    });

    it('should not commit if changes not found', async (done: DoneFn) => {
      spyOn(directoryHasChangesModule, 'directoryHasChanges').and.returnValue(Promise.resolve(false));
      await checkNewBaselineScreenshots('foo-repo', 'build-id');
      expect(infoSpy).toHaveBeenCalledWith('No new screenshots detected. Done.');
      done();
    });

    it('should support custom branch to commit changes to', async (done: DoneFn) => {
      spyOn(directoryHasChangesModule, 'directoryHasChanges').and.returnValue(Promise.resolve(true));
      visualBaselinesBranch = 'custom-branch';
      await checkNewBaselineScreenshots('foo-repo', 'build-id');
      expect(spawnSpy).toHaveBeenCalledWith('git', ['push', '--force', '--quiet', 'origin', visualBaselinesBranch], {
        cwd: path.resolve('MOCK_WORKING_DIRECTORY', '.skypagesvisualbaselinetemp')
      });
      done();
    });
  });

  describe('checkNewFailureScreenshots', () => {
    it('should check for new failure screenshots', async (done: DoneFn) => {
      spyOn(directoryHasChangesModule, 'directoryHasChanges').and.returnValue(Promise.resolve(true));
      await checkNewFailureScreenshots('build-id');
      expect(spawnSpy).toHaveBeenCalledWith('git', ['clone', 'https://MOCK_GITHUB_TOKEN@github.com/blackbaud/skyux-visual-test-results.git', '--branch', 'master', '--single-branch', '.skypagesvisualbaselinetemp']);
      expect(spawnSpy).toHaveBeenCalledWith('git', ['push', '--force', '--quiet', 'origin', 'build-id'], {
        cwd: path.resolve('MOCK_WORKING_DIRECTORY', '.skypagesvisualbaselinetemp')
      });
      expect(infoSpy).toHaveBeenCalledWith('New screenshots detected.');
      expect(infoSpy).toHaveBeenCalledWith('Preparing to commit failure screenshots to the \'build-id\' branch.');
      expect(failedLogSpy).toHaveBeenCalledWith('SKY UX visual test failure!\nScreenshots may be viewed at: https://github.com/blackbaud/skyux-visual-test-results/tree/build-id');
      done();
    });

    it('should not commit if changes not found', async (done: DoneFn) => {
      spyOn(directoryHasChangesModule, 'directoryHasChanges').and.returnValue(Promise.resolve(false));
      await checkNewFailureScreenshots('build-id');
      expect(infoSpy).toHaveBeenCalledWith('No new screenshots detected. Done.');
      done();
    });
  });

});
