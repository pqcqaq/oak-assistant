export type Level = 'ignore' | 'error' | 'warn' | 'info';

export type OakConfiog = {
    projectDir: string;
    // checker配置
    checker?: {
        // 不合法的返回值
        onInvalidReturn?: Level;
        // 不能为解构赋值
        onInvalidDestructuring?: Level;
        // 需要判断Promise
        onNeedPromiseCheck?: Level;
    }
    // 触发器配置
    trigger?: {
        // 返回值为字面量1
        onReturnLiteral?: Level;
        // fn不是async
        onNoAsyncFn?: Level;
        // 没有await context
        onNoAwaitContext?: Level;
    };
    // i18n配置
    i18n?: {
        // 缺少key
        onMissingKey?: Level;
        // key为空
        onKeyBlank?: Level;
    };
    // oak组件配置
    oakComponent?: {
        // entity无效
        onInvalidEntity?: Level;
        // isList无效
        onInvalidIsList?: Level;
        // 缺少data属性
        onMissingDataAttrs?: Level;
        // 缺少方法
        onMissingMethods?: Level;
    };
    // oak路径配置
    oakPath?: {
        // 路径无效
        onInvalidPath?: Level;
    };
};
