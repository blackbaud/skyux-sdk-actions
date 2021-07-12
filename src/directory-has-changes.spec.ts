import { directoryHasChanges } from './directory-has-changes';
import * as spawnModule from './spawn';

describe('directoryHasChanges', () => {
  it('should check if a directory has untracked files', async (done: DoneFn) => {
    spyOn(spawnModule, 'spawn').and.returnValue(Promise.resolve('?? foo'));
    const result = await directoryHasChanges('foo');
    expect(result).toEqual(true);
    done();
  });

  it('should check if a directory has modified files', async (done: DoneFn) => {
    spyOn(spawnModule, 'spawn').and.returnValue(Promise.resolve('M foo'));
    const result = await directoryHasChanges('foo');
    expect(result).toEqual(true);
    done();
  });

  it('should return false if no changes found', async (done: DoneFn) => {
    spyOn(spawnModule, 'spawn').and.returnValue(Promise.resolve(''));
    const result = await directoryHasChanges('foo');
    expect(result).toEqual(false);
    done();
  });
});
