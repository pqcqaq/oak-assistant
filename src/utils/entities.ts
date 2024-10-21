import * as vscode from 'vscode';
import { EntityShape } from 'oak-domain/lib/types';
import path, { join } from 'path';
import fs from 'fs';
import { debounce } from 'lodash';
import { random } from 'lodash';
import { glob } from 'glob';
import { pathConfig } from '../utils/paths';
import { toLowerFirst, toUpperFirst } from '../utils/stringUtils';
import { EntityDesc } from '../types';
import { getWorker } from './workers';

const projectEntityList: string[] = [];

export const updateProjectEntityList = (entityList: string[]) => {
    console.log('updateProjectEntityList:', entityList);
    projectEntityList.splice(0, projectEntityList.length, ...entityList);
    // 通知更新
    updateDeounced();
};

export const getProjectEntityList = () => {
    return projectEntityList;
};

export type EntityDict = {
    [key: string]: EntityDesc<EntityShape>;
};

// 发布订阅模式
const subscribers: Map<number, () => void> = new Map();

const updateDeounced = debounce(() => {
    subscribers.forEach((callback) => callback());
}, 100);

export const subscribe = (callback: () => void) => {
    /**
     *  订阅
     * 可以在一定程度上保证订阅的唯一性
     * @param callback  回调函数
     * @returns  返回一个key，用于取消订阅
     */
    const setToSubscribers = (callback: () => void) => {
        const key = random(0, 100000);
        if (subscribers.has(key)) {
            return setToSubscribers(callback);
        }
        subscribers.set(key, callback);
        return key;
    };

    const key = setToSubscribers(callback);

    return () => {
        subscribers.delete(key);
    };
};

const entitySubscribers: Map<
    string | '#all',
    Map<number, (name: string) => void>
> = new Map();

const updateEntity = (entity: string) => {
    const subscribers = entitySubscribers.get(entity);
    if (subscribers) {
        subscribers.forEach((callback) => callback(entity));
    }
    // 尝试通知#all的
    const allSub = entitySubscribers.get('#all');
    if (allSub) {
        allSub.forEach((callback) => callback(entity));
    }
};

export const subscribeEntity = (
    entityName: string | '#all',
    callback: (name: string) => void
) => {
    let subscribers = entitySubscribers.get(entityName);
    if (!subscribers) {
        subscribers = new Map<number, (name: string) => void>();
        entitySubscribers.set(entityName, subscribers);
    }
    const add = (callback: (name: string) => void) => {
        const key = random(0, 100000);
        if (subscribers.has(key)) {
            return add(callback);
        }
        subscribers.set(key, callback);
        return key;
    };

    const key = add(callback);
    return () => {
        subscribers.delete(key);
    };
};

const entityDictCache: EntityDict = new Proxy({} as EntityDict, {
    set(target, key, value) {
        target[key as string] = value;
        updateDeounced();
        updateEntity(key as string);
        return true;
    },
});

const genEntityNameList = (): string[] => {
    return Object.keys(entityDictCache);
};

export const entityConfig = {
    get entityNameList() {
        // 这里需要排序一下
        return genEntityNameList().sort((a, b) => {
            return a.localeCompare(b);
        });
    },
    getEntityDesc(entityName: string) {
        return entityDictCache[entityName];
    },
};

export const getProjectionList = (entityName: string) => {
    const desc = entityDictCache[entityName];
    if (desc) {
        return desc.projectionList;
    }
    return [];
};

/**
 * 分析 oak-app-domain 项目中的 Entity 定义，防止同时多次分析
 */
let isAnalyzing = false;

export const analyzeOakAppDomain = async (oakAppDomainPath: string) => {
    const worker = getWorker();
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: '分析Entity定义',
            cancellable: false,
        },
        () => {
            return new Promise<void>((resolve, reject) => {
                if (isAnalyzing) {
                    resolve();
                    return;
                }
                isAnalyzing = true;

                // 发送消息开始分析
                worker.removeAllListeners('message');
                worker.removeAllListeners('error');

                worker.on('message', (message) => {
                    if (message.type === 'result') {
                        const error = message.data.error;
                        const entityDict = message.data.entityDict;
                        if (error) {
                            vscode.window.showErrorMessage(error);
                        } else {
                            console.log('收到entityDict');
                            // 更新 entityDictCache
                            Object.keys(entityDict).forEach((key) => {
                                entityDictCache[key] = entityDict[key];
                            });
                        }
                        isAnalyzing = false;
                        resolve();
                    }
                });

                worker.on('error', (error) => {
                    vscode.window.showErrorMessage(
                        `分析过程中发生错误: ${error.message}`
                    );
                    isAnalyzing = false;
                    reject(error);
                });

                worker.postMessage({ type: 'analyze', oakAppDomainPath });
            });
        }
    );

    syncProjectEntityList();
};

export const syncProjectEntityList = () => {
    const entitiesFiles = glob.sync('*.ts', {
        cwd: pathConfig.entityHome,
    });
    const entities = entitiesFiles.map((file) => {
        // 使用 path.basename 来正确地获取文件名（不包含扩展名）
        const entityName = path.basename(file, '.ts');
        return toLowerFirst(entityName);
    });
    updateProjectEntityList(entities);
};

export const getEntityName = (en: string) => {
    return entityConfig.getEntityDesc(en)?.locales.zh_CN?.name || '';
};

export function findEntityDefFile(entityName: string): string[] {
    const fileName = toUpperFirst(`${entityName}.ts`);
    const possiblePaths: string[] = [];

    // 搜索 pathConfig.entityHome
    const entityHomePath = join(pathConfig.entityHome, fileName);
    if (fs.existsSync(entityHomePath)) {
        possiblePaths.push(entityHomePath);
    }

    // 搜索 node_modules 中以 oak 开头的包
    const nodeModulesPath = join(pathConfig.projectHome, 'node_modules');
    const oakPackages = glob.sync('oak-*/src/entities', {
        cwd: nodeModulesPath,
    });
    for (const pkg of oakPackages) {
        const pkgEntityPath = join(nodeModulesPath, pkg, fileName);
        if (fs.existsSync(pkgEntityPath)) {
            possiblePaths.push(pkgEntityPath);
        }
    }

    return possiblePaths;
}

export const getEntityLocalePath = (entityName: string) => {
    return join(
        pathConfig.oakAppDomainHome,
        toUpperFirst(entityName),
        'locales'
    );
};
