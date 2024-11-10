import * as vscode from 'vscode';

// 通过createOutputChannel创建一个输出频道
export const logger = vscode.window.createOutputChannel('oak-assistant');

// 输出日志
export const log = (level: 'log' | 'warn' | 'error' = 'log', ...message: any[]) => {
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
    const prefix = {
        // log: '\x1b[32m[INFO] \x1b[0m', // 绿色
        // warn: '\x1b[33m[WARN] \x1b[0m', // 黄色
        // error: '\x1b[31m[ERROR] \x1b[0m' // 红色
        log: '[INFO] ',
        warn: '[WARN] ',
        error: '[ERROR] '
    }[level];
    logger.appendLine(`${prefix}${msg.join(' ')}`);
};

const oakLogger = {
    log: (...args: any[]) => {
        console.log(...args);
        log('log', ...args);
    },
    error: (...args: any[]) => {
        console.error(...args);
        log('error', ...args);
    },
    warn: (...args: any[]) => {
        console.warn(...args);
        log('warn', ...args);
    },
    info: (...args: any[]) => {
        console.info(...args);
        log('log', ...args);
    },
};

export default oakLogger;