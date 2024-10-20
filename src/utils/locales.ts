import { join } from 'path';
import { LanguageValue, LocaleData, LocaleDef, LocaleItem } from '../types';
import { glob } from 'glob';
import fs from 'fs';
import vscode from 'vscode';
import { entityConfig, subscribe as subsEntity } from './entities';
import { normalizePath, pathConfig, subscribe as subsPath } from './paths';

const locales: LocaleDef = {
    namespaced: {},
    entities: {},
};

const cachedPathLocale: Map<string, LocaleData> = new Map();

export const getAvailableKeys = (
    data: LocaleData,
    prefix: string = ''
): string[] => {
    return Object.entries(data).flatMap(([key, value]) => {
        const newPrefix = prefix ? `${prefix}${key}` : key;
        if (typeof value === 'string') {
            return [newPrefix];
        }
        if (typeof value === 'object' && value !== null) {
            return getAvailableKeys(value, `${newPrefix}.`);
        }
        return [];
    });
};

export const getLocalesByPath = (path: string): LocaleData => {
    if (cachedPathLocale.has(normalizePath(path))) {
        return cachedPathLocale.get(normalizePath(path)) as LocaleData;
    }
    // 在当前目录的zh_CN.json文件或者zh-CN.json文件
    const localePath = join(path);
    if (!fs.existsSync(localePath)) {
        return {};
    }
    // 文件夹存在，查找文件
    const files = glob.sync(`{zh_CN.json,zh-CN.json}`, {
        cwd: localePath,
    });
    // 没有找到中文locale文件, 返回空对象
    if (files.length === 0) {
        return {};
    }
    // 只能有一个定义的中文
    if (files.length !== 1) {
        vscode.window.showErrorMessage(
            `错误：在${localePath}中找到多个中文locale文件`
        );
        return {};
    }
    const localeFile = join(localePath, files[0]);
    cachedPathLocale.set(
        normalizePath(path),
        JSON.parse(fs.readFileSync(localeFile, 'utf-8'))
    );
    return cachedPathLocale.get(normalizePath(path)) as LocaleData;
};

export const findValueByKey = (
    data: LocaleData,
    key: string
): string | undefined => {
    const keys = key.split('.');
    let value: string | LocaleData | undefined = data;

    for (const k of keys) {
        if (typeof value === 'object' && value !== null) {
            value = value[k];
        } else {
            return undefined;
        }
    }
    return typeof value === 'string' ? value : undefined;
};

export const getLocaleValue = (key: string) => {
    // 如果是namespace，则为xxxx::开头
    if (key.includes('::')) {
        const [namespace, keyName] = key.split('::');
        return findValueByKey(locales.namespaced[namespace], keyName);
    }
    // 如果是entity。则为entity:开头
    if (key.includes(':')) {
        const [entityName, keyName] = key.split(':');
        return findValueByKey(locales.entities[entityName], keyName);
    }
    // 什么都没有，直接返回key的最后一个.后面的值
    return key.split('.').pop();
};

export const getNamespacedLocaleItems = (): LocaleItem[] => {
    return [
        ...Object.keys(locales.namespaced)
            .map((namespace) => {
                return getAvailableKeys(
                    locales.namespaced[namespace],
                    `${namespace}::`
                );
            })
            .flat()
            .map((key) => {
                return {
                    label: key,
                    value: key,
                    desc: getLocaleValue(key) || '',
                };
            }),
    ];
};

export const getEntityLocaleItems = (): LocaleItem[] => {
    return [
        ...Object.keys(locales.entities)
            .map((entity) => {
                return getAvailableKeys(locales.entities[entity], `${entity}:`);
            })
            .flat()
            .map((key) => {
                return {
                    label: key,
                    value: key,
                    desc: getLocaleValue(key) || '',
                };
            }),
    ];
};

export const getLocaleItemsByPath = (path: string): LocaleItem[] => {
    const localesGet = getLocalesByPath(path);
    return getAvailableKeys(localesGet).map((key) => {
        return {
            label: key,
            value: key,
            desc: findValueByKey(localesGet, key) || '',
        };
    });
};

let cachedLocaleItems: LocaleItem[] = [];

export const clearCachedLocaleItems = () => {
    cachedLocaleItems = [];
};

export const isKeyExist = (key: string): boolean => {
    return cachedLocaleItems.every((item) => item.value !== key);
};

/**
 *  获取locales的数据
 * @param path  locales的路径
 * @param prefix  前缀
 * @returns  返回一个LocaleItem数组
 */
export const getLocalesData = (path: string, prefix?: string): LocaleItem[] => {
    if (!cachedLocaleItems.length) {
        cachedLocaleItems = [
            ...getLocaleItemsByPath(path),
            ...getNamespacedLocaleItems(),
            ...getEntityLocaleItems(),
        ];
    }
    const locales = cachedLocaleItems;

    if (!prefix) {
        return locales;
    }

    // 如果有前缀，那么要进行过滤
    return locales.filter((locale) => {
        return locale.value.startsWith(prefix);
    });
};

const setNameSpaceLocales = () => {
    const localePath = pathConfig.localesHome;
    // 拿到这个目录下面的所有文件夹（不是文件
    const dirs = fs.readdirSync(localePath).filter((file) => {
        return fs.statSync(join(localePath, file)).isDirectory();
    });
    dirs.map((dir) => {
        const localesGet = getLocalesByPath(join(localePath, dir));
        locales.namespaced[dir] = localesGet;
    });
};

// 监听entity的变化
const setEntityLocales = () => {
    entityConfig.entityNameList.forEach((name) => {
        locales.entities[name] =
            entityConfig.getEntityDesc(name).locales.zh_CN ||
            ({} as LanguageValue);
    });
};

subsEntity(() => {
    setEntityLocales();
    clearCachedLocaleItems();
});

// 在路径变化的时候，重新设置namespaced的locales
subsPath(() => {
    setNameSpaceLocales();
    clearCachedLocaleItems();
});

export const deleteCachedPathLocale = (path: string) => {
    cachedPathLocale.delete(path);
    clearCachedLocaleItems();
};
