import {DullahanAdapterDefaultOptions, DullahanAdapterUserOptions} from '@k2g/dullahan';

export type DullahanAdapterSelenium3UserOptions = Partial<DullahanAdapterUserOptions & {
    browserName?: 'chrome' | 'firefox' | 'edge' | 'ie' | 'safari';
    requireDriver?: 'chromedriver' | 'geckodriver' | 'iedriver' | '@sitespeed.io/edgedriver' | string;
    browserBinary: string;
    driverBinary: string;
    seleniumRemoteUrl: string;
    rawCapabilities: object;
    maximizeWindow: boolean;
}>;

export const DullahanAdapterSelenium3DefaultOptions = {
    ...DullahanAdapterDefaultOptions,
    browserName: 'chrome',
    maximizeWindow: true,
    rawCapabilities: {}
};

export type DullahanAdapterSelenium3Options =
    DullahanAdapterSelenium3UserOptions
    & typeof DullahanAdapterSelenium3DefaultOptions;
