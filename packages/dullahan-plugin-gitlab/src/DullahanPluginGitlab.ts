import {DullahanPluginGitlabUserOptions, DullahanPluginGitlabDefaultOptions} from './DullahanPluginGitlabOptions';

import {DullahanPlugin, DullahanClient} from '@k2g/dullahan';

export default class DullahanPluginGitlab extends DullahanPlugin<
    DullahanPluginGitlabUserOptions,
    typeof DullahanPluginGitlabDefaultOptions
> {

    public constructor(args: {
        client: DullahanClient;
        userOptions: DullahanPluginGitlabUserOptions;
    }) {
        super({
            ...args,
            defaultOptions: DullahanPluginGitlabDefaultOptions
        });
    }

    public async start(): Promise<void> {
        // TODO
    }

    public async stop(): Promise<void> {
        // TODO
    }
}
