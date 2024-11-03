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
import { componentConfig } from './components';

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
                key as string,
                target[norKey].zhCNpath
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
export const getLocalesByPath = (
    path: string
): {
    path: string;
    data: LocaleData;
} => {
    // 在当前目录的zh_CN.json文件或者zh-CN.json文件
    const localePath = join(path);
    if (!fs.existsSync(localePath)) {
        return {
            path: localePath,
            data: {} as LocaleData,
        };
    }
    // 文件夹存在，查找文件
    const files = glob.sync(`{zh_CN.json,zh-CN.json}`, {
        cwd: localePath,
    });
    // 没有找到中文locale文件, 返回空对象
    if (files.length === 0) {
        return {
            path: localePath,
            data: {} as LocaleData,
        };
    }
    // 只能有一个定义的中文
    if (files.length !== 1) {
        vscode.window.showErrorMessage(
            `错误：在${localePath}中找到多个中文locale文件`
        );
        return {
            path: localePath,
            data: {} as LocaleData,
        };
    }
    const localeFile = join(localePath, files[0]);
    return {
        path: localeFile,
        data: JSON.parse(fs.readFileSync(localeFile, 'utf-8')),
    };
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
            locales.namespaced[namespaceName].locales,
            `${namespaceName}::`
        ).map((key) => {
            return {
                label: key,
                value: key,
                desc:
                    findValueByKey(
                        locales.namespaced[namespaceName].locales,
                        key.split('::')[1]
                    ) || '',
                path: join(pathConfig.localesHome, namespaceName),
                zhCnFile: locales.namespaced[namespaceName].zhCNpath,
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
                    desc:
                        findValueByKey(
                            locales.entities[name],
                            key.split(':')[1]
                        ) || '',
                    path: getEntityLocalePath(key.split(':')[0]),
                    zhCnFile: join(getEntityLocalePath(name), 'zh_CN.json'),
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
const getLocaleItemsByPath = (path: string, filePath: string): LocaleItem[] => {
    // console.log('更新componentItems缓存', path);
    const norPath = normalizePath(path);
    return getAvailableKeys(locales.components[norPath].locales).map((key) => {
        return {
            label: key,
            value: key,
            desc:
                findValueByKey(locales.components[norPath].locales, key) || '',
            path,
            zhCnFile: filePath,
        };
    });
};

const isPathCached = (path: string): boolean => {
    const norPath = normalizePath(path);
    return !!cachedLocaleItems.components[norPath];
};

const updatePathCached = (path: string) => {
    const got = getLocalesByPath(path);
    locales.components[path] = {
        locales: got.data || {},
        zhCNpath: got.path,
    };
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
    rawPath: string,
    prefix: string = '',
    force?: boolean
): LocaleItem[] => {
    setLoadingLocale(true);

    const path = normalizePath(rawPath);

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
        locales.namespaced[dir] = {
            locales: localesGet.data,
            zhCNpath: localesGet.path,
        };
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

export const preLoadLocales = () => {
    setNameSpaceLocales();
    setEntityLocales('');
    const componentsPath = componentConfig.getAllComponents().map((c) => {
        return c.path;
    });
    componentsPath.forEach((path) => {
        updatePathCached(path);
    });
};

export const reloadCachedPathLocale = (path: string) => {
    const norPath = normalizePath(join(path, '..'));
    locales.components[norPath] = {
        zhCNpath: '',
        locales: {},
    };
    updatePathCached(norPath);
};

export const getCachedLocaleItemByKey = (
    key: string
): LocaleItem | undefined => {
    return getLocaleItem(key);
};

export const addLocaleToData = (
    localeData: any,
    key: string,
    value: string = ''
): void => {
    const keys = key.split('.');
    let current = localeData;

    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];

        if (i === keys.length - 1) {
            // 最后一个键，直接赋值
            current[k] = value;
        } else {
            // 不是最后一个键，检查下一级
            if (!(k in current)) {
                // 如果键不存在，创建一个新的对象
                current[k] = {};
            } else if (typeof current[k] !== 'object') {
                // 如果存在但不是对象，抛出错误
                throw new Error(
                    `Cannot add key "${key}". "${k}" is not an object.`
                );
            }
            // 移动到下一级
            current = current[k];
        }
    }
};

export const addKeyToLocale = (
    keyPath: string,
    value: string
): {
    path?: string;
    error?: string;
} => {
    // 如果是namespace，则为xxxx::开头
    if (keyPath.includes('::')) {
        const [namespace, key] = keyPath.split('::');
        const path = join(pathConfig.localesHome, namespace);
        // 如果文件不存在则创建
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
        // 判断是否存在 zh_CN.json 文件，如果不存在则使用 zh-CN.json
        let localeFilePath = join(path, 'zh-CN.json');
        if (!fs.existsSync(localeFilePath)) {
            localeFilePath = join(path, 'zh_CN.json');
            if (!fs.existsSync(localeFilePath)) {
                // 如果两个都不存在，创建一个新的 zh_CN.json 文件
                fs.writeFileSync(localeFilePath, '{}');
            }
        }
        // 尝试读取文件
        let localeData = {};
        try {
            localeData = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
        } catch (error) {
            // 如果读取文件失败，直接返回
            return {
                error: '读取文件失败',
            };
        }
        // 添加新的键值对
        addLocaleToData(localeData, key, value);
        // 写入文件
        fs.writeFileSync(localeFilePath, JSON.stringify(localeData, null, 2));
        // 更新缓存
        locales.namespaced[namespace].locales = localeData;
        return {
            path: localeFilePath,
        };
    } else if (keyPath.includes(':')) {
        return {
            error: '暂不支持entity的locales编辑',
        };
    }
    return {
        error: '这个函数只用于处理namespace的locales',
    };
};

subscribeEntity('#all', (name) => {
    setEntityLocales(name);
});

// 在路径变化的时候，重新设置namespaced的locales
subsPath(() => {
    setNameSpaceLocales();
});
