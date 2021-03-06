import {DullahanApi} from './api/DullahanApi';
import {DullahanError} from './DullahanError';

export class DullahanTest<Api extends DullahanApi<never, never> = DullahanApi<never, never>> {

    public readonly name: string;

    public readonly tags: string[];

    public readonly disabled: boolean;

    public readonly run: (api: Api) => Promise<void>;

    public constructor({name, tags, disabled, run}: {
        name: string;
        tags: string[];
        disabled?: boolean;
        run: (api: Api) => Promise<void>;
    }) {
        this.name = name;
        this.tags = tags;
        this.disabled = !!disabled;
        this.run = run;
    }
}

export const isValidTest = (test: Partial<DullahanTest>): test is DullahanTest => {
    if (typeof test.name !== 'string') {
        console.error(new DullahanError('Test does not have a property "name" of type "string"'));
    } else if (test.disabled !== undefined && typeof test.disabled !== 'boolean') {
        console.error(new DullahanError('Test does not have a property "disabled" of type "boolean" or "undefined"'));
    } else if (!Array.isArray(test.tags)) {
        console.error(new DullahanError('Test does not have a property "tags" of type "string[]"'));
    } else if (typeof test.run !== 'function') {
        console.error(new DullahanError('Test does not have a property "run" of type "(api) => Promise<void>"'));
    } else {
        return true;
    }

    return false;
};
