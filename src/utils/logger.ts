import * as vscode from 'vscode';
// 通过createOutputChannel创建一个输出频道
export const logger = vscode.window.createOutputChannel('oak-assistant');

// 输出日志
export const log = (...message: any[]) => {
    // 将日志信息输出到频道。需要判断类型
    const msg: string[] = message.map((msg) => {
        if (typeof msg === 'object') {
            return JSON.stringify(msg, null, 2);
        } else if (Array.isArray(msg)) {
            return msg.join(' ');
        } else {
            return msg;
        }
    });
    logger.appendLine(msg.join(' '));
};

// polyfill全局的console对象，重定向到输出频道
const console = global.console;
global.console = {
    ...console,
    log: (...args: any[]) => {
        console.log(...args);
        log(...args);
    },
    error: (...args: any[]) => {
        console.error(...args);
        log(...args);
    },
    warn: (...args: any[]) => {
        console.warn(...args);
        log(...args);
    },
    info: (...args: any[]) => {
        console.info(...args);
        log(...args);
    },
};
