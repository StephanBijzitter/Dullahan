import {
    DullahanRunnerAwsLambdaDefaultOptions,
    DullahanRunnerAwsLambdaUserOptions
} from './DullahanRunnerAwsLambdaOptions';
import * as fastGlob from 'fast-glob';
import asyncPool from 'tiny-async-pool';
import {
    DullahanClient,
    DullahanError,
    DullahanFunctionEndCall,
    DullahanRunner,
    DullahanTestEndCall,
    tryIgnore
} from '@k2g/dullahan';
import {Lambda} from 'aws-sdk';

interface Test extends DullahanTestEndCall {
    calls: DullahanFunctionEndCall[];
}

export default class DullahanRunnerAwsLambda extends DullahanRunner<DullahanRunnerAwsLambdaUserOptions, typeof DullahanRunnerAwsLambdaDefaultOptions> {

    private hasStopSignal = false;

    private readonly lambda = new Lambda({
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
        region: this.options.region
    });

    public constructor(args: {
        client: DullahanClient;
        userOptions: DullahanRunnerAwsLambdaUserOptions;
    }) {
        super({
            ...args,
            defaultOptions: DullahanRunnerAwsLambdaDefaultOptions
        });
    }

    public async start(): Promise<void> {
        return this.options.role === 'master' ? this.startMaster() : this.startSlave();
    }

    private async startMaster(): Promise<void> {
        const {client, options, rootDirectories, includeGlobs, excludeGlobs, includeRegexes, excludeRegexes} = this;
        const {maxConcurrency, minSuccesses, maxAttempts, failFast, testPredicate} = options;

        if (includeGlobs.length === 0) {
            includeGlobs.push('**/*')
        }

        const searchResults = await Promise.all(rootDirectories.map((rootDirectory) => fastGlob(includeGlobs, {
            cwd: rootDirectory,
            ignore: excludeGlobs,
            absolute: true,
            dot: true
        })));

        const testFiles: string[] = (await Promise.all(
            searchResults.flat()
                .filter((file) =>
                    includeRegexes.some((iRegex) => iRegex.test(file))
                    && !excludeRegexes.some((eRegex) => eRegex.test(file)))
                .map(async (file: string) => {
                    const instance = client.getTestInstance(file);
                    const accepted = !!instance && await testPredicate(file, instance.test);
                    return {file, accepted};
                })
        )).filter(({accepted}) => accepted).map(({file}) => file);

        const nextPool = [...testFiles];

        do {
            const currentPool = nextPool.splice(0, nextPool.length);

            await asyncPool(maxConcurrency, currentPool, async (testData) => {
                if (this.hasStopSignal) {
                    return;
                }

                const success = await this.processFile(testData.file).catch((error) => {
                    console.error(error);

                    return false;
                });
                success ? testData.successes++ : testData.failures++;

                if (testData.successes >= minSuccesses) {
                    return;
                }

                const hasMoreAttempts = testData.successes + testData.failures < maxAttempts;
                const couldStillPass = maxAttempts - testData.failures >= minSuccesses;

                if (hasMoreAttempts && couldStillPass) {
                    nextPool.push(testData);
                } else if (failFast) {
                    this.hasStopSignal = true;
                }
            });
        } while (nextPool.length && !this.hasStopSignal);
    }

    private async startSlave(): Promise<void> {
        const {client, options} = this;
        const {file} = options.slaveOptions;

        const instance = client.getTestInstance(file);

        if (!instance) {
            return;
        }

        const {testId, test, adapter, api} = instance;

        const timeStart = Date.now();
        const testName = test.name;

        try {
            client.emitTestStart({
                testId,
                testName,
                timeStart
            });

            await adapter.openBrowser();
            await test.run(api);
            await adapter.closeBrowser();

            client.emitTestEnd({
                testId,
                testName,
                timeStart,
                error: null,
                timeEnd: Date.now()
            });
        } catch (error) {
            client.emitTestEnd({
                testId,
                error: new DullahanError(error),
                testName,
                timeStart,
                timeEnd: Date.now()
            });

            await tryIgnore(1, async () => {
                if (await adapter.isBrowserOpen()) {
                    await adapter.screenshotPage();
                }
            });

            await tryIgnore(3, async () => {
                if (await adapter.isBrowserOpen()) {
                    await adapter.closeBrowser();
                }
            });
        }
    }

    private async processFile(file: string): Promise<boolean> {
        const {lambda, client, options} = this;
        const {slaveQualifier, slaveFunctionName, slaveOptions} = options;

        const {Payload} = await lambda.invoke({
            Qualifier: slaveQualifier!,
            FunctionName: slaveFunctionName!,
            Payload: JSON.stringify({
                body: JSON.stringify({
                    ...slaveOptions,
                    file
                })
            })
        }).promise();

        const [{calls, ...testEndCall}] = JSON.parse(JSON.parse(Payload as string)) as [Test];

        client.emitTestStart(testEndCall);
        calls.forEach((functionEndCall) => client.emitFunctionStart(functionEndCall));
        calls.forEach((functionEndCall) => client.emitFunctionEnd(functionEndCall));
        client.emitTestEnd(testEndCall);

        return !testEndCall.error;
    }
}
