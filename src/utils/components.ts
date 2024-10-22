import { random, debounce, groupBy, update } from 'lodash';
import { EnhtityComponentMap, EntityComponentDef } from '../types';
import { normalizePath, pathConfig, subscribe } from './paths';
import ts from 'typescript';
import { glob } from 'glob';
import fs from 'fs';
import { join } from 'path';
import { onEntityLoaded } from './status';
import { getAttrsFromFormData, getAttrsFromMethods } from './ts-utils';

const entityComponents: EnhtityComponentMap = new Proxy(
    {} as EnhtityComponentMap,
    {
        set(target, key, value) {
            target[key as string] = value;
            // updateDeounced(key as string);
            // 通知all
            updateAllDeounced(key as string);
            return true;
        },
    }
);

export const componentConfig = {
    getEntityComponents: (name: string) => {
        return entityComponents[name] || [];
    },
};

const subscribers = new Map<number, (name: string) => void>();

const updateAllDeounced = debounce((name: string) => {
    subscribers.forEach((callback) => callback(name));
}, 100);

export const subscribeAll = (callback: (name: string) => void) => {
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

export const scanComponents = (scanPath: string[]): EntityComponentDef[] => {
    const componentList: EntityComponentDef[] = [];

    function visitNode(node: ts.Node, path: string) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'OakComponent'
        ) {
            const args = node.arguments;
            if (args.length === 1 && ts.isObjectLiteralExpression(args[0])) {
                const properties = args[0].properties;
                const entity = properties.find(
                    (prop) =>
                        ts.isPropertyAssignment(prop) &&
                        prop.name.getText() === 'entity'
                );
                const isList = properties.find(
                    (prop) =>
                        ts.isPropertyAssignment(prop) &&
                        prop.name.getText() === 'isList'
                );

                const formData = properties.find(
                    (prop) =>
                        ts.isMethodDeclaration(prop) &&
                        prop.name.getText() === 'formData'
                );

                const method = properties.find(
                    (prop) =>
                        ts.isPropertyAssignment(prop) &&
                        prop.name.getText() === 'methods'
                );

                let formDataAttrs: string[] = [];
                let methodNames: string[] = [];
                // 获取formData下的block 下的 returnStatement 下的ObjectLiteralExpression 下的properties
                if (formData) {
                    formDataAttrs = getAttrsFromFormData(formData);
                }

                if (method) {
                    methodNames = getAttrsFromMethods(method);
                }

                if (entity && isList) {
                    if (
                        ts.isShorthandPropertyAssignment(entity) ||
                        ts.isShorthandPropertyAssignment(isList)
                    ) {
                        console.log('ShorthandPropertyAssignment 还不支持');
                        return;
                    }
                    if (
                        ts.isSpreadAssignment(entity) ||
                        ts.isSpreadAssignment(isList)
                    ) {
                        console.log('SpreadAssignment 还不支持');
                        return;
                    }
                    // MethodDeclaration
                    if (
                        ts.isMethodDeclaration(entity) ||
                        ts.isMethodDeclaration(isList)
                    ) {
                        console.log('MethodDeclaration 还不支持');
                        return;
                    }
                    //GetAccessorDeclaration
                    if (
                        ts.isGetAccessorDeclaration(entity) ||
                        ts.isGetAccessorDeclaration(isList)
                    ) {
                        console.log('GetAccessorDeclaration 还不支持');
                        return;
                    }
                    // SetAccessorDeclaration
                    if (
                        ts.isSetAccessorDeclaration(entity) ||
                        ts.isSetAccessorDeclaration(isList)
                    ) {
                        console.log('SetAccessorDeclaration 还不支持');
                        return;
                    }
                    // 这里的path是整个文件夹的路径
                    componentList.push({
                        path: normalizePath(join(path, '..')),
                        entityName: entity.initializer.getText().slice(1, -1),
                        isList: isList.initializer.getText() === 'true',
                        components: [],
                        formDataAttrs: formDataAttrs.length
                            ? formDataAttrs
                            : undefined,
                        methodNames: methodNames.length ? methodNames : undefined,
                    });
                }
            }
        }

        ts.forEachChild(node, (node) => {
            visitNode(node, path);
        });
    }

    scanPath.forEach((dirPath) => {
        const files = glob.sync(`${dirPath}/**/index.ts`);

        files.forEach((filePath) => {
            // 因为涉及到路径的比较，所以需要规范化路径
            const normalizedPath = normalizePath(filePath);
            const sourceFile = ts.createSourceFile(
                filePath,
                fs.readFileSync(filePath, 'utf-8'),
                ts.ScriptTarget.ES2015,
                true
            );

            ts.forEachChild(sourceFile, (node) => {
                visitNode(node, normalizedPath);
            });
        });
    });

    componentList.forEach((component) => {
        const path = join(component.path, '..');
        // 查找web.pc.tsx 文件
        const webPcTsx = glob.sync(join(path, 'web.pc.tsx'));
        // 如果有
        if (webPcTsx.length) {
            component.components.push({
                type: 'web.pc',
                path: normalizePath(webPcTsx[0]),
                children: [], // 这里的children关系先不管
            });
        }
        // 查找web.tsx 文件
        const webTsx = glob.sync(join(path, 'web.tsx'));
        // 如果有
        if (webTsx.length) {
            component.components.push({
                type: 'web',
                path: normalizePath(webTsx[0]),
                children: [], // 这里的children关系先不管
            });
        }

        // 查找 index.xml
        const indexXml = glob.sync(join(path, 'index.xml'));
        // 如果有
        if (indexXml.length) {
            component.components.push({
                type: 'miniapp',
                path: normalizePath(indexXml[0]),
                children: [], // 这里的children关系先不管
            });
        }
    });

    return componentList;
};

/**
 *  添加组件到entity
 * @param components 组件列表
 */
export const addComponentsToEntity = (components: EntityComponentDef[]) => {
    components.forEach((component) => {
        const entityName = component.entityName;
        const list = entityComponents[entityName] || [];
        list.push(component);
        entityComponents[entityName] = list;
    });
};

/**
 *  从entity中删除component
 * @param path  文件路径
 */
export const removeConponentFromEntity = (path: string) => {
    let found = false;
    // 调用这个函数的时候就已经删除了，所以直接forEach
    Object.keys(entityComponents).forEach((entityName) => {
        const list = entityComponents[entityName];
        const index = list.findIndex((item) => item.path === path);
        if (index > -1) {
            // 从list中删除
            list.splice(index, 1);
            entityComponents[entityName] = list;
            found = true;
        }
    });

    if (!found) {
        console.log('没有找到要删除的component，可能会出现问题');
    }
};

/**
 *  更新entity的component
 * @param path  文件路径
 * @returns  void
 */
export const updateEntityComponent = (path: string) => {
    // 直接删除，后面再添加（修改entity的情况）
    removeConponentFromEntity(path);
    const [newComponent] = scanComponents([path]);
    if (!newComponent) {
        console.log('没有找到新的component');
        return;
    }
    addComponentsToEntity([newComponent]);
};

/**
 *  根据路径前缀删除
 * @param prefixPath 路径前缀
 */
export const removeByPrefixPath = (prefixPath: string) => {
    let found = false;
    Object.keys(entityComponents).forEach((entityName) => {
        const list = entityComponents[entityName];
        const index = list.findIndex((item) =>
            item.path.startsWith(prefixPath)
        );
        if (index > -1) {
            // 从list中删除
            list.splice(index, 1);
            entityComponents[entityName] = list;
            found = true;
        }
    });

    if (!found) {
        console.log('没有找到要删除的component，可能会出现问题');
    }
};

/**
 *  判断是否是一个组件的index.ts所在目录
 * @param path  文件路径
 */
export const isOakComponentIndex = (path: string) => {
    // 假定这里的缓存中，一定包含了所有的entity的component
    if (!path.endsWith('index.ts')) {
        return false;
    }
    // 查找是否存在这个组件
    const norPath = normalizePath(path);
    return Object.values(entityComponents).some((list) => {
        return list.some((item) => item.path === norPath);
    });
};

/**
 *  判断是否是一个组件的render文件
 * @param path  文件路径
 * @returns  是否是一个组件的render文件
 */
export const isOakComponentRenderFile = (path: string) => {
    const norPath = normalizePath(path);
    return Object.values(entityComponents).some((list) => {
        return list.some((item) => {
            return item.components.some((component) => {
                return component.path === norPath;
            });
        });
    });
};

/**
 *  获取index.ts文件的component数据
 * @param path  index.ts文件路径
 * @returns  component数据
 */
export const getOakComponentData = (path: string) => {
    const norPath = normalizePath(path);
    return Object.values(entityComponents)
        .flat()
        .find((component) => {
            return component.path === norPath;
        });
};

export const loadComponents = () => {
    const scanPath = [pathConfig.componentsHome, pathConfig.pagesHome];
    const components = scanComponents(scanPath);
    addComponentsToEntity(components);
    console.log('components loaded:', entityComponents);
};

onEntityLoaded(() => {
    // 订阅path的更新
    subscribe(() => {
        loadComponents();
    });
});
