import * as vscode from 'vscode';
import { EntityShape } from 'oak-domain/lib/types';
import path, { join } from 'path';
import fs from 'fs';
import { debounce } from 'lodash';
import { random } from 'lodash';
import { glob } from 'glob';
import { mkdirsSync, pathConfig } from '../utils/paths';
import { toLowerFirst, toUpperFirst } from '../utils/stringUtils';
import { EntityDesc } from '../types';
// import { getWorker, startWorker } from './workers';
import { setLoadingEntities } from './status';
// import { Worker } from 'worker_threads';
import { createProjectProgram } from './ts-utils';
import assert from 'assert';
import ts from 'typescript';

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

function getProjectionListFromSchema(
    filePath: string,
    program: ts.Program
): string[] {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
        // vscode.window.showWarningMessage(`无法解析文件: ${filePath}`);
        return [];
    }

    let projectionList: string[] = [];

    ts.forEachChild(sourceFile, (node) => {
        if (
            ts.isTypeAliasDeclaration(node) &&
            node.name.text === 'Projection'
        ) {
            if (ts.isIntersectionTypeNode(node.type)) {
                // 我们只关心交叉类型的第一个成员
                const firstMember = node.type.types[0];
                if (ts.isTypeLiteralNode(firstMember)) {
                    projectionList = firstMember.members
                        .map((member) => {
                            if (ts.isPropertySignature(member) && member.name) {
                                return member.name
                                    .getText(sourceFile)
                                    .replace(/[?:]$/, '');
                            }
                            return '';
                        })
                        .filter(Boolean);
                }
            }
        }
    });
    return projectionList;
}

/**
 * 分析 oak-app-domain 项目中的 Entity 定义，防止同时多次分析
 */
let isAnalyzing = false;

export const analyzeOakAppDomain = async (
    oakAppDomainPath: string,
    forceUpdate: boolean
) => {
    if (isAnalyzing) {
        return;
    }

    // 先尝试读取缓存
    const cacheFile = join(pathConfig.cachePath, 'oakEntity.json');
    const enableCache = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('cacheEntityAnalyze');

    if (!forceUpdate && enableCache) {
        if (fs.existsSync(cacheFile)) {
            try {
                const domainIndexFilePath = join(
                    pathConfig.oakAppDomainHome,
                    'index.ts'
                );
                // 如果文件不存在，显示未找到实体定义信息，并返回
                if (!fs.existsSync(domainIndexFilePath)) {
                    vscode.window.showErrorMessage('未找到实体定义信息');
                    return;
                }
                // 获取文件的修改时间
                const domainIndexFileStat = fs.statSync(domainIndexFilePath);
                // 缓存文件的修改时间
                const cacheFileStat = fs.statSync(cacheFile);
                // 若缓存文件的修改时间晚于实体定义文件的修改时间，则直接从缓存加载
                if (cacheFileStat.mtimeMs < domainIndexFileStat.mtimeMs) {
                    throw new Error('缓存文件已过期');
                }
                const context = fs.readFileSync(cacheFile, 'utf-8');
                const entityDict = JSON.parse(context);
                // 更新 entityDictCache
                Object.keys(entityDict).forEach((key) => {
                    entityDictCache[key] = entityDict[key];
                });

                console.log('从缓存加载成功');
                return;
            } catch (e) {
                console.error('尝试从缓存读取失败', e);
            } finally {
                isAnalyzing = false;
                setLoadingEntities(false);
                syncProjectEntityList();
            }
        } else {
            console.log('缓存不存在，开始分析');
        }
    }

    // let worker: Worker | null = null;

    // try {
    //     worker = getWorker();
    // } catch (error) {
    //     worker = startWorker();
    // }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: '分析Entity定义',
            cancellable: false,
        },
        async () => {
            setLoadingEntities(true);
            isAnalyzing = true;
            try {
                // return new Promise<void>((resolve, reject) => {
                // 现在改为直接读取编译之后的文件
                const StorageFilePath = join(
                    pathConfig.cachePath,
                    'oakStorageCompileCache',
                    'Storage.js'
                );

                // 文件是否存在
                if (!fs.existsSync(StorageFilePath)) {
                    compileStorageFile();
                }

                // 如果还是不存在，应该是编译失败
                if (!fs.existsSync(StorageFilePath)) {
                    vscode.window.showErrorMessage('Storage文件编译失败');
                    return;
                }

                const { storageSchema } = require(StorageFilePath);

                assert(
                    storageSchema && storageSchema instanceof Object,
                    'storageSchema 未找到'
                );

                const storagePath = join(
                    pathConfig.oakAppDomainHome,
                    'Storage.ts'
                );
                const StorageProgram = createProjectProgram(storagePath);

                Object.keys(storageSchema).forEach((key) => {
                    console.log('处理entity数据:', key);
                    // 合并locales
                    const localesPath = getEntityLocalePath(key);
                    const content = fs.readFileSync(
                        join(localesPath, 'zh_CN.json'),
                        'utf-8'
                    );
                    const locales = JSON.parse(content);
                    Object.assign(storageSchema[key], {
                        locales: {
                            zh_CN: locales,
                        },
                    });

                    // 查找并合并projectionList
                    const EntityName = toUpperFirst(key);
                    const EntityDescPath = join(
                        pathConfig.oakAppDomainHome,
                        EntityName,
                        'Schema.ts'
                    );

                    const list = getProjectionListFromSchema(
                        EntityDescPath,
                        StorageProgram
                    );
                    Object.assign(storageSchema[key], { projectionList: list });
                });

                // 更新 entityDictCache
                Object.keys(storageSchema).forEach((key) => {
                    entityDictCache[key] = storageSchema[key];
                });
                if (enableCache) {
                    // 写入缓存
                    fs.writeFile(
                        cacheFile,
                        JSON.stringify(storageSchema),
                        (err) => {
                            console.error(err);
                        }
                    );
                }
            } catch (error) {
                console.log('分析过程中发生错误:', error);
                vscode.window.showErrorMessage(`分析过程中发生错误`);
            } finally {
                isAnalyzing = false;
                setLoadingEntities(false);
                syncProjectEntityList();
            }

            // resolve();

            // isAnalyzing = true;

            // 发送消息开始分析
            // worker.removeAllListeners('message');
            // worker.removeAllListeners('error');

            // worker.on('message', (message) => {
            //     if (message.type === 'result') {
            //         const error = message.data.error;
            //         const entityDict = message.data.entityDict;
            //         if (error) {
            //             vscode.window.showErrorMessage(error);
            //         } else {
            //             console.log('收到entityDict');
            //             // 更新 entityDictCache
            //             Object.keys(entityDict).forEach((key) => {
            //                 entityDictCache[key] = entityDict[key];
            //             });
            //             if (enableCache) {
            //                 // 写入缓存
            //                 fs.writeFile(
            //                     cacheFile,
            //                     JSON.stringify(entityDict),
            //                     (err) => {
            //                         console.error(err);
            //                     }
            //                 );
            //             }
            //         }
            //         isAnalyzing = false;
            //         setLoadingEntities(false);
            //         console.log(
            //             '分析完成, 耗时:',
            //             performance.now() - startTime
            //         );
            //         resolve();
            //     }
            // });

            // worker.on('error', (error) => {
            //     vscode.window.showErrorMessage(
            //         `分析过程中发生错误: ${error.message}`
            //     );
            //     isAnalyzing = false;
            //     reject(error);
            // });

            // const startTime = performance.now();
            // worker.postMessage({ type: 'analyze', oakAppDomainPath });
            // });
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

const compileStorageFile = () => {
    const cachePath = join(pathConfig.cachePath, 'oakStorageCompileCache');
    const storagePath = join(pathConfig.oakAppDomainHome, 'Storage.ts');
    const program = createProjectProgram(storagePath);
    // 编译后保存到缓存目录
    program.emit(undefined, (fileName, data) => {
        const filePath = fileName.split('oak-app-domain')[1];
        console.log('filePath:', filePath);
        const outputPath = join(cachePath, filePath);
        mkdirsSync(path.dirname(outputPath));
        fs.writeFileSync(outputPath, data);
    });
};

export const genProjections = (name: string): string[] => {
    const entityAttrs = entityConfig.getEntityDesc(name)?.attributes;
    return Object.keys(entityAttrs)
        .map((attr) => {
            const field = (entityAttrs as any)[attr];
            if (!field) {
                return '';
            }
            if (!['object', 'ref'].includes(field.type as string)) {
                return attr;
            }
            return '';
        })
        .filter((attr) => !!attr);
};

// 注册命令oak-assistant.refreshEntity
export const registerRefreshEntityCommand = () => {
    const command = vscode.commands.registerCommand(
        'oak-assistant.refreshEntity',
        () => {
            analyzeOakAppDomain(pathConfig.oakAppDomainHome, true);
        }
    );

    return {
        dispose() {
            command.dispose();
        },
        activate(context: vscode.ExtensionContext) {
            context.subscriptions.push(command);
        },
    };
};
