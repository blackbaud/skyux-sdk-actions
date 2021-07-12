import mock from 'mock-require';
import path from 'path';

describe('screenshot comparator', () => {
  let directoryHasChanges: boolean;
  let failedLogSpy: jasmine.Spy;
  let infoSpy: jasmine.Spy;
  let spawnSpy: jasmine.Spy;
  let visualBaselinesBranch: string;

  beforeEach(() => {
    mock('rimraf', {
      sync() {},
    });

    mock('fs-extra', {
      copy() {},
    });

    spyOn(process, 'exit');

    visualBaselinesBranch = '';
    failedLogSpy = jasmine.createSpy('setFailed');
    infoSpy = jasmine.createSpy('info');

    mock('@actions/core', {
      getInput: (key: string) => {
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
      },
      info: infoSpy,
      setFailed: failedLogSpy,
    });

    directoryHasChanges = true;

    mock('./directory-has-changes', {
      directoryHasChanges() {
        return Promise.resolve(directoryHasChanges);
      },
    });

    spawnSpy = jasmine.createSpy('spawn');

    mock('./spawn', {
      spawn: spawnSpy,
    });
  });

  function getUtil() {
    // Refresh the clone utility, too.
    mock.reRequire('./clone-repo-as-admin');

    return mock.reRequire('./screenshot-comparator');
  }

  describe('checkNewBaselineScreenshots', () => {
    it('should check for new baseline screenshots', async (done: DoneFn) => {
      const { checkNewBaselineScreenshots } = getUtil();

      await checkNewBaselineScreenshots('foo-repo', 'build-id');

      expect(spawnSpy).toHaveBeenCalledWith('git', [
        'clone',
        'https://MOCK_GITHUB_TOKEN@github.com/foo-repo.git',
        '--branch',
        'master',
        '--single-branch',
        '.skypagesvisualbaselinetemp',
      ]);
      expect(spawnSpy).toHaveBeenCalledWith(
        'git',
        ['push', '--force', '--quiet', 'origin', 'master'],
        {
          cwd: path.resolve(
            'MOCK_WORKING_DIRECTORY',
            '.skypagesvisualbaselinetemp'
          ),
        }
      );
      expect(infoSpy).toHaveBeenCalledWith('New screenshots detected.');
      expect(infoSpy).toHaveBeenCalledWith(
        "Preparing to commit baseline screenshots to the 'master' branch."
      );
      expect(infoSpy).toHaveBeenCalledWith('New baseline images saved.');
      done();
    });

    it('should not commit if changes not found', async (done: DoneFn) => {
      directoryHasChanges = false;

      const { checkNewBaselineScreenshots } = getUtil();

      await checkNewBaselineScreenshots('foo-repo', 'build-id');
      expect(infoSpy).toHaveBeenCalledWith(
        'No new screenshots detected. Done.'
      );
      done();
    });

    it('should support custom branch to commit changes to', async (done: DoneFn) => {
      visualBaselinesBranch = 'custom-branch';

      const { checkNewBaselineScreenshots } = getUtil();

      await checkNewBaselineScreenshots('foo-repo', 'build-id');
      expect(spawnSpy).toHaveBeenCalledWith(
        'git',
        ['push', '--force', '--quiet', 'origin', visualBaselinesBranch],
        {
          cwd: path.resolve(
            'MOCK_WORKING_DIRECTORY',
            '.skypagesvisualbaselinetemp'
          ),
        }
      );
      done();
    });
  });

  describe('checkNewFailureScreenshots', () => {
    it('should check for new failure screenshots', async (done: DoneFn) => {
      const { checkNewFailureScreenshots } = getUtil();

      await checkNewFailureScreenshots('build-id');
      expect(spawnSpy).toHaveBeenCalledWith('git', [
        'clone',
        'https://MOCK_GITHUB_TOKEN@github.com/blackbaud/skyux-visual-test-results.git',
        '--branch',
        'master',
        '--single-branch',
        '.skypagesvisualbaselinetemp',
      ]);
      expect(spawnSpy).toHaveBeenCalledWith(
        'git',
        ['push', '--force', '--quiet', 'origin', 'build-id'],
        {
          cwd: path.resolve(
            'MOCK_WORKING_DIRECTORY',
            '.skypagesvisualbaselinetemp'
          ),
        }
      );
      expect(infoSpy).toHaveBeenCalledWith('New screenshots detected.');
      expect(infoSpy).toHaveBeenCalledWith(
        "Preparing to commit failure screenshots to the 'build-id' branch."
      );
      expect(failedLogSpy).toHaveBeenCalledWith(
        'SKY UX visual test failure!\nScreenshots may be viewed at: https://github.com/blackbaud/skyux-visual-test-results/tree/build-id'
      );
      done();
    });

    it('should not commit if changes not found', async (done: DoneFn) => {
      directoryHasChanges = false;

      const { checkNewFailureScreenshots } = getUtil();

      await checkNewFailureScreenshots('build-id');
      expect(infoSpy).toHaveBeenCalledWith(
        'No new screenshots detected. Done.'
      );
      done();
    });
  });
});
