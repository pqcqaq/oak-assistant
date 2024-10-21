const globalStatus = {
    isLoadingEntities: false,
    isLoadingLocale: false,
};

export const setLoadingEntities = (loading: boolean) => {
    globalStatus.isLoadingEntities = loading;
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