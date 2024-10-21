import { random } from 'lodash';

const globalStatus = {
    isLoadingEntities: false,
    isLoadingLocale: false,
};

export const setLoadingEntities = (loading: boolean) => {
    globalStatus.isLoadingEntities = loading;
    if (!loading) {
        entitySubscribers.forEach((callback) => {
            callback();
        });
    }
};

export const isLoadingEntities = () => {
    return globalStatus.isLoadingEntities;
};

export const setLoadingLocale = (loading: boolean) => {
    globalStatus.isLoadingLocale = loading;
};

export const isLoadingLocale = () => {
    return globalStatus.isLoadingLocale;
};

const entitySubscribers = new Map<number, () => void>();

export const onEntityLoaded = (callback: () => void): (() => void) => {
    const key = random(0, 100000);
    if (entitySubscribers.has(key)) {
        return onEntityLoaded(callback);
    }
    entitySubscribers.set(key, callback);
    return () => {
        entitySubscribers.delete(key);
    };
};

export const waitUntilEntitiesLoaded = async () => {
    return new Promise<boolean>((resolve) => {
        const check = () => {
            if (globalStatus.isLoadingEntities) {
                setTimeout(check, 100);
            } else {
                resolve(true);
            }
        };
        check();
    });
};

export const waitUntilLocaleLoaded = async () => {
    return new Promise<boolean>((resolve) => {
        const check = () => {
            if (globalStatus.isLoadingLocale) {
                setTimeout(check, 100);
            } else {
                resolve(true);
            }
        };
        check();
    });
};
