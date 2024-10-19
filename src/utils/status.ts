const globalStatus = {
    isLoadingEntities: false,
};

export const setLoadingEntities = (loading: boolean) => {
    globalStatus.isLoadingEntities = loading;
};

export const isLoadingEntities = () => {
    return globalStatus.isLoadingEntities;
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
