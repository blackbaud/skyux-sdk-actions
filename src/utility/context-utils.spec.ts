import * as github from '@actions/github';
import { Context } from '@actions/github/lib/context';

import * as utils from './context-utils';

describe('Utils', () => {
  let originalContext: Context;

  beforeEach(() => {
    originalContext = github.context;
  });

  afterEach(() => {
    Object.defineProperty(github, 'context', {
      value: originalContext,
    });
  });

  it('should return the git tag', () => {
    Object.defineProperty(github, 'context', {
      value: {
        ref: 'refs/tags/1.0.0',
      },
    });
    const result = utils.getTag();
    expect(result).toEqual('1.0.0');
  });

  it('should detect if commit is a pull request', () => {
    Object.defineProperty(github, 'context', {
      value: {
        eventName: 'pull_request',
      },
    });
    const result = utils.isPullRequest();
    expect(result).toEqual(true);
  });

  it('should detect if commit is a push', () => {
    Object.defineProperty(github, 'context', {
      value: {
        ref: 'refs/heads/master',
      },
    });
    const result = utils.isPush();
    expect(result).toEqual(true);
  });

  it('should detect if commit is a tag', () => {
    Object.defineProperty(github, 'context', {
      value: {
        ref: 'refs/tags/1.0.0',
      },
    });
    const result = utils.isTag();
    expect(result).toEqual(true);
  });
});
