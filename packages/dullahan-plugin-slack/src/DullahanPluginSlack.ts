import {DullahanPluginSlackDefaultOptions, DullahanPluginSlackUserOptions} from './DullahanPluginSlackOptions';
import {IncomingWebhook} from '@slack/client';
import {
    DullahanClient,
    DullahanError,
    DullahanFunctionEndCall,
    DullahanPlugin,
    DullahanTestEndCall,
    StoredArtifact
} from '@k2g/dullahan';
import {isFailingTest, isSlowTest, isSuccessfulTest, isUnstableTest, Test} from "./helpers";

export default class DullahanPluginSlack extends DullahanPlugin<DullahanPluginSlackUserOptions, typeof DullahanPluginSlackDefaultOptions> {

    public constructor(args: {
        client: DullahanClient;
        userOptions: DullahanPluginSlackUserOptions;
    }) {
        super({
            ...args,
            defaultOptions: DullahanPluginSlackDefaultOptions
        });
    }

    public async start(): Promise<void> {
        const {options} = this;
        const {webhook, channel} = options;

        if (typeof webhook !== 'string') {
            throw new DullahanError('Could not send message to Slack: no webhook');
        }

        if (typeof channel !== 'string') {
            throw new DullahanError('Could not send message to Slack: no channel');
        }
    }

    public async processResults(artifacts: StoredArtifact[], dtecs: DullahanTestEndCall[], dfecs: DullahanFunctionEndCall[]): Promise<void> {
        const {options} = this;
        const {webhook, channel, slowTestThreshold, when, attachments, maxPreviews} = options;

        const tests: Test[] = dtecs
            .reverse()
            .filter(({testId}, index) => index === dtecs.findIndex((dtec) => dtec.testId === testId))
            .map((dtec) => ({
                ...dtec,
                calls: dfecs
                    .filter(({testId}) => dtec.testId === testId)
                    .map((call) => {
                        const {functionResult} = call;

                        if (typeof functionResult === 'string' && functionResult.length > 1024) {
                            return {
                                ...call,
                                functionResult: '<truncated>'
                            };
                        }

                        return call;
                    })
            }))
            .reverse();

        const failingTests = tests.filter(isFailingTest);
        const unstableTests = tests.filter(isUnstableTest);
        const slowTests = tests.filter(isSlowTest.bind(null, slowTestThreshold));
        const successfulTests = tests.filter(isSuccessfulTest.bind(null, slowTestThreshold));

        const links = artifacts
            .filter(({scope, name, remoteUrls}) => scope.startsWith('dullahan-plugin-report-') && name.includes('report') && remoteUrls.length)
            .map(({scope, remoteUrls}) => `<${remoteUrls[0]}|${/report-(.*)/.exec(scope)![1]}>`);

        const {browserstackBuildUrl} = tests.find(({browserstackBuildUrl}) => !!browserstackBuildUrl) ?? {
            browserstackBuildUrl: undefined
        };

        if (browserstackBuildUrl) {
            links.push(`<${browserstackBuildUrl}|browserstack>`);
        }

        const message = {
            blocks: [{
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `New results: ${failingTests} failing tests, ${unstableTests} unstable tests, ${slowTests} slow tests and ${successfulTests} successful tests`
                }
            }, {
                type: 'divider'
            }, ...failingTests.slice(0, maxPreviews).map((test) => ({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${test.testName}*\n${test.error.name}: ${test.error.message}`
                },
                accessory: test.calls
                    .filter(({remoteUrls}) => remoteUrls?.length)
                    .map(({remoteUrls}) => ({
                        image_url: remoteUrls![0],
                        type: 'image',
                        alt_text: 'screenshot'
                    }))
                    .pop()
            })), {
                type: 'divider'
            }, {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `More information: ${links.join(', ')}`
                }
            }, {
                type: 'divider'
            }],
            attachments: [
                {
                    color: '#000000',
                    fields: Object.entries(attachments).map(([title, value]) => ({
                        title,
                        value: typeof value === 'string' ? value : `${value}`,
                        short: true
                    }))
                }
            ]
        };

        if (when === 'always' || (failingTests.length === 0 && when === 'success') || (failingTests.length > 0 && when === 'failure')) {
            await new IncomingWebhook(webhook!, {
                link_names: true,
                channel
            }).send(message);
        }
    }
}
