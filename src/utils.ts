import * as github from '@actions/github';

export function isPullRequest(): boolean {
  return (github.context.eventName === 'pull_request');
}

export function isTag(): boolean {
  return (github.context.ref.indexOf('refs/tags/') === 0);
}

export function isPush(): boolean {
  return (github.context.ref.indexOf('refs/heads/') === 0);
}

export function getTag(): string {
  return github.context.ref.replace('refs/tags/', '');
}
