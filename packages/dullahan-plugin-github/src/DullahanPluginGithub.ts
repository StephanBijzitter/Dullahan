import {DullahanPluginGithubDefaultOptions, DullahanPluginGithubUserOptions} from './DullahanPluginGithubOptions';
import {Octokit} from '@octokit/rest';

import {
    DullahanClient,
    DullahanError,
    DullahanFunctionEndCall,
    DullahanPlugin,
    DullahanTestEndCall,
    StoredArtifact
} from '@k2g/dullahan';

export default class DullahanPluginGithub extends DullahanPlugin<DullahanPluginGithubUserOptions,
    typeof DullahanPluginGithubDefaultOptions> {

    private lastStatusCheck = Date.now() - 60000;
    private successfulTestsCounter = 0;
    private failedTestsCounter = 0;

    private readonly octokit = new Octokit({
        auth: `token ${this.options.githubToken}`
    });

    public constructor(args: {
        client: DullahanClient;
        userOptions: DullahanPluginGithubUserOptions;
    }) {
        super({
            ...args,
            defaultOptions: DullahanPluginGithubDefaultOptions
        });
    }

    public async start(): Promise<void> {
        const {enableStatusChecks} = this.options;

        if (enableStatusChecks) {
            await this.setStatus();
        }
    }

    public async onTestEnd(dtec: DullahanTestEndCall): Promise<DullahanTestEndCall> {
        const {options, lastStatusCheck} = this;
        const {enableStatusChecks} = options;
        const {error} = dtec;

        if (error) {
            this.failedTestsCounter++;
        } else {
            this.successfulTestsCounter++;
        }

        if (enableStatusChecks && lastStatusCheck + 60000 > Date.now()) {
            await this.setStatus();
        }

        return dtec;
    }

    public async processResults(artifacts: StoredArtifact[], dtecs: DullahanTestEndCall[], dfecs: DullahanFunctionEndCall[]): Promise<void> {
        const {options} = this;
        const {enableStatusChecks, enablePullRequestComments, enablePullRequestReviews, statusName, statusUrl} = options;

        const html = artifacts.find(({scope, name}) => scope === 'dullahan-plugin-report-html' && name === 'report');
        const markdown = artifacts.find(({scope, name}) => scope === 'dullahan-plugin-report-markdown' && name === 'report');

        const comment = markdown?.data ?? '[@k2g/dullahan-plugin-report-markdown](https://github.com/Kaartje2go/Dullahan/tree/master/packages/dullahan-plugin-report-markdown) not found';
        const promises: Promise<void>[] = [];

        if (enableStatusChecks) {
            promises.push(this.setStatus(html?.remoteUrls[0] ?? markdown?.remoteUrls[0]));
        }

        if (enablePullRequestReviews) {
            promises.push(this.setReview(comment));
        }

        if (enablePullRequestComments) {
            promises.push(this.setComment(comment));
        }

        await Promise.all(promises);
    }

    private async setStatus(url?: URL): Promise<void> {
        const {options, octokit, failedTestsCounter, successfulTestsCounter} = this;
        const {repositoryName, repositoryOwner, commitHash, statusUrl, statusName} = options;

        const state = url ? failedTestsCounter ? 'failure' : 'success' : 'pending';
        const description = `${successfulTestsCounter}/${successfulTestsCounter + failedTestsCounter} tests have passed`;

        this.lastStatusCheck = Date.now();

        if (typeof repositoryOwner !== 'string') {
            throw new DullahanError('Could not set status on Github: no repositoryOwner');
        }

        if (typeof repositoryName !== 'string') {
            throw new DullahanError('Could not set status on Github: no repositoryName');
        }

        if (typeof commitHash !== 'string') {
            throw new DullahanError('Could not set status on Github: no commitHash');
        }

        await octokit.repos.createStatus({
            owner: repositoryOwner,
            repo: repositoryName,
            sha: commitHash,
            state,
            context: statusName,
            target_url: url?.href ?? statusUrl,
            description
        });
    }

    private async setComment(comment: string): Promise<void> {
        const {options, octokit} = this;
        const {repositoryName, repositoryOwner, commitOwner, branchName} = options;
        const identifier = comment.substring(0, comment.indexOf(']'));

        if (typeof repositoryOwner !== 'string') {
            throw new DullahanError('Could not add/update comment on Github: no repositoryOwner');
        }

        if (typeof repositoryName !== 'string') {
            throw new DullahanError('Could not add/update comment on Github: no repositoryName');
        }

        if (typeof branchName !== 'string') {
            throw new DullahanError('Could not add/update comment on Github: no branchName');
        }

        const {data: pullRequests} = await octokit.pulls.list({
            owner: repositoryOwner,
            repo: repositoryName,
            head: `${commitOwner ?? repositoryOwner}:${branchName}`,
            state: 'open'
        });
        const pullRequestNumber = pullRequests[0]?.number;

        const {data: comments} = await octokit.issues.listComments({
            owner: repositoryOwner,
            repo: repositoryName,
            issue_number: pullRequestNumber
        });
        const commentId = comments.find(({body}) => body.startsWith(identifier))?.id;

        if (typeof commentId === 'number') {
            await octokit.issues.updateComment({
                owner: repositoryOwner,
                repo: repositoryName,
                comment_id: commentId,
                body: comment
            });
        } else {
            await octokit.issues.createComment({
                owner: repositoryOwner,
                repo: repositoryName,
                issue_number: pullRequestNumber,
                body: comment
            });
        }
    }

    private async setReview(comment: string): Promise<void> {
        const {options, octokit, failedTestsCounter} = this;
        const {repositoryName, repositoryOwner, commitOwner, branchName} = options;

        if (typeof repositoryOwner !== 'string') {
            throw new DullahanError('Could not add review on Github: no repositoryOwner');
        }

        if (typeof repositoryName !== 'string') {
            throw new DullahanError('Could not add review on Github: no repositoryName');
        }

        if (typeof branchName !== 'string') {
            throw new DullahanError('Could not add review on Github: no branchName');
        }

        const {data: pullRequests} = await octokit.pulls.list({
            owner: repositoryOwner,
            repo: repositoryName,
            head: `${commitOwner ?? repositoryOwner}:${branchName}`,
            state: 'open'
        });
        const pullRequestNumber = pullRequests[0]?.number;

        await octokit.pulls.createReview({
            owner: repositoryOwner,
            repo: repositoryName,
            pull_number: pullRequestNumber,
            body: comment,
            event: failedTestsCounter ? 'REQUEST_CHANGES' : 'APPROVE'
        });
    }
}
