export type Level = 'ignore' | 'error' | 'warn' | 'info';

export type OakConfiog = {
    projectDir: string;
    // 下面还未实现相关配置
    trigger?: {
        onReturnLiteral?: Level;
        onNoAsyncFn?: Level;
        onNoAwaitContext?: Level;
    };
    i18n?: {
        onMissingKey?: Level;
    };
    oakComponent?: {
        onInvalidEntity?: Level;
        onInvalidIsList?: Level;
        onMissingDataAttrs?: Level;
        onMissingMethods?: Level;
    };
    oakPath?: {
        onInvalidPath?: Level;
    };
};
