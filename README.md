# @skyux-sdk/actions

## Usage

```
- uses: blackbaud/skyux-sdk-actions@master
  with:
    browser-stack-access-key: ${{ secrets.BROWSER_STACK_ACCESS_KEY }}
    browser-stack-username: ${{ secrets.BROWSER_STACK_USERNAME }}
    github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
    npm-token: ${{ secrets.NPM_TOKEN }}
    slack-webhook: ${{ secrets.SLACK_WEBHOOK }}
```
See the `actions.yml` file for all available inputs.

### Preventing the action from running for specific commits

You may append `[ci skip]` to the commit message (or pull request title when squash-merging) to instruct the action to skip all steps. Git tags will still release, however.

## Build

```
npm run build && npm run pack
```
