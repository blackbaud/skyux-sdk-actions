import * as core from '@actions/core';

import * as slack from '@slack/webhook';

import {
  notifySlack
} from './notify-slack';

describe('notifySlack', () => {

  it('should notify Slack', async (done: DoneFn) => {
    const message = 'Some message.';
    spyOn(core, 'getInput').and.returnValue('https://webhook');
    spyOnProperty(slack, 'IncomingWebhook').and.returnValue(
      function () {
        return {
          send(payload: any) {
            expect(payload.text).toEqual(message);
          }
        };
      }
    );

    const infoStub = spyOn(core, 'info');
    await notifySlack(message);
    expect(infoStub).toHaveBeenCalledWith('Notifying Slack.');
    done();
  });

  it('should handle missing webhook', async (done: DoneFn) => {
    spyOn(core, 'getInput').and.returnValue('');
    const infoStub = spyOn(core, 'info');
    await notifySlack('');
    expect(infoStub).toHaveBeenCalledWith('No webhook available for Slack notification.');
    done();
  });
});
