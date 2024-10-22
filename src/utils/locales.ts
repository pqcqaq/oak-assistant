import path, { join } from 'path';
import {
    ComponentLocale,
    EntityLocale,
    LanguageValue,
    LocaleData,
    LocaleDef,
    LocaleItem,
    NamespaceLocale,
} from '../types';
import { glob } from 'glob';
import fs from 'fs';
import vscode from 'vscode';
import { entityConfig, getEntityLocalePath, subscribeEntity } from './entities';
import { normalizePath, pathConfig, subscribe as subsPath } from './paths';
import { setLoadingLocale } from './status';

const locales: LocaleDef = {
    namespaced: new Proxy({} as NamespaceLocale, {
        set: (target, key, value) => {
            target[key as string] = value;
            cachedLocaleItems.namespaced[key as string] =
                getNamespacedLocaleItems(key as string)[key as string];
            return true;
        },
    }),
    entities: new Proxy({} as EntityLocale, {
        set: (target, key, value) => {
            target[key as string] = value;
            cachedLocaleItems.entities[key as string] = getEntityLocaleItems(
                key as string
            )[key as string];
            return true;
        },
    }),
    components: new Proxy({} as ComponentLocale, {
        set: (target, key, value) => {
            const norKey = normalizePath(key as string);
            target[norKey] = value;
            cachedLocaleItems.components[norKey] = getLocaleItemsByPath(
                key as string
            );
            return true;
        },
    }),
};

const cachedLocaleItems: {
    namespaced: {
        [namespace: string]: LocaleItem[];
    };
    entities: {
        [entity: string]: LocaleItem[];
    };
    components: {
        [path: string]: LocaleItem[];
    };
} = {
    namespaced: {},
    entities: {},
    components: {},
};

/**
 *  获取所有的key
 * @param data  LocaleData
 * @param prefix  前缀
 * @returns  返回一个string数组
 */
export const getAvailableKeys = (
    data: LocaleData,
    prefix: string = ''
): string[] => {
    if (!data) {
        return [];
    }
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

/**
 * 通过路径获取locales
 * @param path      路径
 * @returns  返回一个LocaleData
 */
export const getLocalesByPath = (path: string): LocaleData => {
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
    return JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
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

/**
 *  在缓存的数据中查找值
 * @param key  key
 * @returns  返回一个string
 */
export const getLocaleItem = (key: string): LocaleItem | undefined => {
    // 如果是namespace，则为xxxx::开头
    if (key.includes('::')) {
        // 从cachedLocaleItems中找到对应的值
        return Object.values(cachedLocaleItems.namespaced)
            .flat()
            .find((item) => {
                return item.value === key;
            });
    }
    // 如果是entity。则为entity:开头
    if (key.includes(':')) {
        return Object.values(cachedLocaleItems.entities)
            .flat()
            .find((item) => {
                return item.value === key;
            });
    }
    // 如果是component，则为路径开头
    return Object.values(cachedLocaleItems.components)
        .flat()
        .find((item) => {
            return item.value === key;
        });
};

/**
 *  获取namespaced的localeItems
 * @param namespaceName  namespace的名字
 * @returns  返回一个对象
 * 只能在proxy中使用
 */
const getNamespacedLocaleItems = (
    namespaceName: string
): {
    [namespace: string]: LocaleItem[];
} => {
    console.log('更新namespacedItems缓存', namespaceName);
    return {
        [namespaceName]: getAvailableKeys(
            locales.namespaced[namespaceName],
            `${namespaceName}::`
        ).map((key) => {
            return {
                label: key,
                value: key,
                desc:
                    findValueByKey(locales.namespaced[namespaceName], key) ||
                    '',
                path: join(pathConfig.localesHome, namespaceName),
            };
        }),
    };
};

/**
 *  获取entity的localeItems
 * @param name      entity的名字
 * @returns  返回一个对象
 * 只能在proxy中使用
 */
const getEntityLocaleItems = (
    name: string
): {
    [entity: string]: LocaleItem[];
} => {
    return {
        [name]: getAvailableKeys(locales.entities[name], `${name}:`).map(
            (key) => {
                return {
                    label: key,
                    value: key,
                    desc: findValueByKey(locales.entities[name], key) || '',
                    path: getEntityLocalePath(key.split(':')[0]),
                };
            }
        ),
    };
};

/**
 *  获取component的localeItems
 * @param path  component的路径
 * @returns  返回一个LocaleItem数组
 * 只能在proxy中使用
 */
const getLocaleItemsByPath = (path: string): LocaleItem[] => {
    console.log('更新componentItems缓存', path);
    const norPath = normalizePath(path);
    return getAvailableKeys(locales.components[norPath]).map((key) => {
        return {
            label: key,
            value: key,
            desc: findValueByKey(locales.components[norPath], key) || '',
            path,
        };
    });
};

export const isKeyExist = (key: string): boolean => {
    return !!getLocaleItem(key);
};

const isPathCached = (path: string): boolean => {
    const norPath = normalizePath(path);
    return !!cachedLocaleItems.components[norPath];
};

const updatePathCached = (path: string) => {
    locales.components[path] = getLocalesByPath(path);
};

const getCachedComponentItems = (path: string): LocaleItem[] => {
    return cachedLocaleItems.components[path] || [];
};

/**
 *  获取locales的数据
 * @param path  locales的路径
 * @param prefix  前缀
 * @returns  返回一个LocaleItem数组
 */
export const getLocalesData = (
    path: string,
    prefix: string = '',
    force?: boolean
): LocaleItem[] => {
    setLoadingLocale(true);

    if (force) {
        updatePathCached(path);
    }

    if (!isPathCached(path)) {
        updatePathCached(path);
    }

    const items = [
        getCachedComponentItems(path),
        ...Object.values(cachedLocaleItems.entities),
        ...Object.values(cachedLocaleItems.namespaced),
    ];

    setLoadingLocale(false);

    if (prefix) {
        return items.flatMap((item) => {
            return item.filter((i) => i.value.startsWith(prefix));
        });
    }

    return items.flat();
};

/**
 * 在locales的namespace中设置locales
 */
const setNameSpaceLocales = () => {
    console.log('主动更新namespaced缓存');

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

// 监听entity的变化, 设置entity的locales
const setEntityLocales = (name: string) => {
    // console.log('主动更新entity缓存', name);

    if (name) {
        locales.entities[name] =
            entityConfig.getEntityDesc(name).locales.zh_CN ||
            ({} as LanguageValue);
        return;
    }
    entityConfig.entityNameList.forEach((name) => {
        locales.entities[name] =
            entityConfig.getEntityDesc(name).locales.zh_CN ||
            ({} as LanguageValue);
    });
};

export const reloadCachedPathLocale = (path: string) => {
    const norPath = normalizePath(join(path, ".."));
    locales.components[norPath] = {};
    updatePathCached(norPath);
};

export const getCachedLocaleItemByKey = (
    key: string
): LocaleItem | undefined => {
    return getLocaleItem(key);
};

subscribeEntity('#all', (name) => {
    setEntityLocales(name);
});

// 在路径变化的时候，重新设置namespaced的locales
subsPath(() => {
    setNameSpaceLocales();
});
