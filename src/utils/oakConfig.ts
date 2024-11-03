import { join } from 'path';
import { Level, OakConfiog } from '../types/OakConfig';
import { pathConfig } from './paths';
import fs from 'fs';
import * as vscode from 'vscode';

export const defaultConfig: OakConfiog = {
    projectDir: './',
    checker: {
        onInvalidReturn: "error",
        onInvalidDestructuring: "error",
        onNeedPromiseCheck: "error",
    },
    trigger: {
        onReturnLiteral: 'warn',
        onNoAsyncFn: 'error',
        onNoAwaitContext: 'error',
    },
    i18n: {
        onMissingKey: 'error',
        onKeyBlank: 'warn',
    },
    oakComponent: {
        onInvalidEntity: 'error',
        onInvalidIsList: 'error',
        onMissingDataAttrs: 'warn',
        onMissingMethods: 'error',
    },
    oakPath: {
        onInvalidPath: 'error',
    },
} as const;

let cachedConfig: OakConfiog = defaultConfig;

/**
 *  深度合并对象
 * @param target  目标对象
 * @param source  源对象
 * @returns  合并后的对象(以source覆盖target中的字段)
 * 比如target是默认配置信息，source是用户配置信息，那么source中的配置会覆盖target中的配置，返回一个完整的配置信息
 */
const deepMergeObject = (target: any, source: any): any => {
    // 如果目标不是对象或源不是对象，直接返回源
    if (typeof target !== 'object' || target === null) {
        return JSON.parse(JSON.stringify(source));
    }
    if (typeof source !== 'object' || source === null) {
        return JSON.parse(JSON.stringify(target));
    }

    // 创建一个新的对象以存储合并结果
    const result: any = Array.isArray(target) ? [] : {};

    // 遍历目标对象的属性
    Object.keys(target).forEach((key) => {
        result[key] = deepMergeObject(target[key], source[key]);
    });

    // 遍历源对象的属性
    Object.keys(source).forEach((key) => {
        if (!(key in target)) {
            result[key] = deepMergeObject(undefined, source[key]);
        }
    });

    return result;
};

export const loadConfig = () => {
    const path = join(pathConfig.projectHome, 'oak.config.json');

    // 如果文件不存在，则返回默认配置
    if (!fs.existsSync(path)) {
        console.warn('oak.config.json not found, use default config');
        cachedConfig = defaultConfig;
    }

    const content = fs.readFileSync(path, 'utf-8');
    const config = JSON.parse(content);
    cachedConfig = deepMergeObject(defaultConfig, config);

    console.log('load config:', cachedConfig);
};

type AbsConfigKey = {
    [key: string]: string | AbsConfigKey;
};

export const findValueByKey = (
    data: AbsConfigKey,
    key: string
): string | undefined => {
    const keys = key.split('.');
    let value: string | AbsConfigKey | undefined = data;

    for (const k of keys) {
        if (typeof value === 'object' && value !== null) {
            value = value[k];
        } else {
            return undefined;
        }
    }
    return typeof value === 'string' ? value : undefined;
};

export const getLevel = (
    key: string
): vscode.DiagnosticSeverity | undefined => {
    const level = findValueByKey(cachedConfig, key);
    switch (level) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'warn':
            return vscode.DiagnosticSeverity.Warning;
        case 'info':
            return vscode.DiagnosticSeverity.Information;
        default:
            console.error('unknown level key or level:', key, level);
            return undefined;
    }
};
