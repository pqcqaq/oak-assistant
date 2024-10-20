import * as vscode from 'vscode';
import { EntityShape } from 'oak-domain/lib/types';
import path, { join, dirname } from 'path';
import fs from 'fs';
import * as ts from 'typescript';
import { debounce } from 'lodash';
import { random } from 'lodash';
import * as glob from 'glob';
import { pathConfig } from '../utils/paths';
import { toLowerFirst, toUpperFirst } from '../utils/stringUtils';
import { EntityDesc } from '../types';

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

const entityDict: EntityDict = new Proxy({} as EntityDict, {
    set(target, key, value) {
        target[key as string] = value;
        updateDeounced();
        return true;
    },
});

const genEntityNameList = (): string[] => {
    return Object.keys(entityDict);
};

export const entityConfig = {
    get entityNameList() {
        return genEntityNameList();
    },
    getEntityDesc(entityName: string) {
        return entityDict[entityName];
    },
};

export const getProjectionList = (entityName: string) => {
    const desc = entityDict[entityName];
    if (desc) {
        return desc.projectionList;
    }
    return [];
};

function resolveImportPath(importPath: string, currentDir: string): string {
    if (importPath.startsWith('.')) {
        return join(currentDir, `${importPath}.ts`);
    }
    // 处理非相对路径的导入（如 node_modules）
    return importPath;
}

function getEvaluateNodeForShorthandProperty(
    program: ts.Program,
    node: ts.ShorthandPropertyAssignment,
    typeChecker: ts.TypeChecker
): any {
    const symbol = typeChecker.getSymbolAtLocation(node.name);
    if (!symbol) {
        return undefined;
    }

    // 获取符号的声明
    const declarations = symbol.declarations;
    if (!declarations || declarations.length === 0) {
        return undefined;
    }

    const declaration = declarations[0];
    // 从当前文件的所有导入中找到对应的导入
    const sourceFile = declaration.getSourceFile();
    let propertyName = '';
    const importDeclaration = sourceFile.statements.find((statement) => {
        // 在这里找到import { actions } from "./Actions" 这样的形式
        if (ts.isImportDeclaration(statement)) {
            const moduleSpecifier = statement.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const imports = statement.importClause?.namedBindings;
                // 如果导入了node.name
                if (imports && ts.isNamedImports(imports)) {
                    // 这里需要注意，如果是import { generalActions as actions } from "./Actions" 这样的形式，要拿到as的内容和node.name进行比较
                    return imports.elements.some((element) => {
                        if (ts.isImportSpecifier(element)) {
                            if (element.propertyName) {
                                propertyName = element.propertyName.getText();
                                // 这里要确保是as actions里的actions和node.name进行比较
                                return element
                                    .getText()
                                    .endsWith(` as ${node.getText()}`);
                            }
                            // 这里是import { actions } from "./Actions" 这样的形式
                            propertyName = element.name.getText();
                            return element.name.getText() === node.getText();
                        }
                        return false;
                    });
                }
            }
        }
        return false;
    }) as ts.ImportDeclaration | undefined;

    // 这里对包内的genericActions做特殊处理
    if (propertyName === 'genericActions') {
        return [
            'count',
            'stat',
            'download',
            'select',
            'aggregate',
            'create',
            'remove',
            'update',
        ];
    }

    if (importDeclaration) {
        // 得到导入的路径
        const importPath = (
            importDeclaration.moduleSpecifier as ts.StringLiteral
        ).text;
        const currentSourceFile = node.getSourceFile();
        const resolvedPath = resolveImportPath(
            importPath,
            dirname(currentSourceFile.fileName)
        );

        // 创建新的程序来解析导入的文件
        const importProgram = ts.createProgram(
            [resolvedPath],
            program.getCompilerOptions()
        );
        const importSourceFile = importProgram.getSourceFile(resolvedPath);

        if (importSourceFile) {
            let foundDeclaration: ts.Node | undefined;
            ts.forEachChild(importSourceFile, (child) => {
                if (ts.isVariableStatement(child)) {
                    const declaration = child.declarationList.declarations[0];
                    if (
                        ts.isIdentifier(declaration.name) &&
                        declaration.name.text === propertyName
                    ) {
                        foundDeclaration = declaration;
                    }
                } else if (
                    ts.isFunctionDeclaration(child) &&
                    child.name &&
                    child.name.text === propertyName
                ) {
                    foundDeclaration = child;
                } else if (
                    ts.isExportAssignment(child) &&
                    ts.isIdentifier(child.expression) &&
                    child.expression.text === propertyName
                ) {
                    foundDeclaration = child;
                }
            });

            if (foundDeclaration) {
                return evaluateNode(
                    importProgram,
                    foundDeclaration,
                    importProgram.getTypeChecker()
                );
            }
        }
    }
    // 如果没有找到导入声明，则假设它是当前文件中的定义
    return evaluateNode(program, declaration, typeChecker);
}

function evaluateNode(
    program: ts.Program,
    node: ts.Node,
    typeChecker: ts.TypeChecker
): any {
    if (ts.isObjectLiteralExpression(node)) {
        return node.properties.reduce((obj: any, prop) => {
            if (ts.isShorthandPropertyAssignment(prop)) {
                // 得到标识符的名称
                const name = prop.name.getText();
                const evaluated = getEvaluateNodeForShorthandProperty(
                    program,
                    prop,
                    typeChecker
                );
                obj[name] = evaluated;
            } else if (ts.isPropertyAssignment(prop)) {
                const name = prop.name.getText();
                obj[name] = evaluateNode(
                    program,
                    prop.initializer,
                    typeChecker
                );
            }
            return obj;
        }, {});
    } else if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map((element) =>
            evaluateNode(program, element, typeChecker)
        );
    } else if (ts.isStringLiteral(node)) {
        return node.text;
    } else if (ts.isNumericLiteral(node)) {
        return Number(node.text);
    } else if (node.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
    } else if (node.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
    } else if (ts.isIdentifier(node)) {
        // 处理导入的标识符
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.valueDeclaration) {
            return evaluateNode(program, symbol.valueDeclaration, typeChecker);
        }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
        // 处理变量声明
        return evaluateNode(program, node.initializer, typeChecker);
    }
    // 对于其他类型的节点，可能需要进一步处理
    return undefined;
}

function parseDescFile(
    filePath: string,
    program: ts.Program
): EntityDesc<EntityShape> | null {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
        vscode.window.showWarningMessage(`无法解析文件: ${filePath}`);
        return null;
    }

    const typeChecker = program.getTypeChecker();
    let descObject: EntityDesc<EntityShape> | null = null;

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isVariableStatement(node)) {
            const declaration = node.declarationList.declarations[0];
            if (
                ts.isIdentifier(declaration.name) &&
                declaration.name.text === 'desc'
            ) {
                if (
                    declaration.initializer &&
                    ts.isObjectLiteralExpression(declaration.initializer)
                ) {
                    descObject = evaluateNode(
                        program,
                        declaration.initializer,
                        typeChecker
                    );
                }
            }
        }
    });

    return descObject;
}

function parseSchemaFile(filePath: string, program: ts.Program): string[] {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
        vscode.window.showWarningMessage(`无法解析文件: ${filePath}`);
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

export const analyzeOakAppDomain = async (path: string) => {
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
                // 开始分析，先清空entityDict
                Object.keys(entityDict).forEach((key) => {
                    delete entityDict[key];
                });

                const storageFile = join(path, 'Storage.ts');

                if (!fs.existsSync(storageFile)) {
                    vscode.window.showErrorMessage(
                        'Storage.ts文件不存在，请先尝试make:domain'
                    );
                    return;
                }

                const program = ts.createProgram([storageFile], {});
                const sourceFile = program.getSourceFile(storageFile);

                if (!sourceFile) {
                    vscode.window.showErrorMessage('无法解析Storage.ts文件');
                    return;
                }

                let storageSchemaNode: ts.Node | undefined;

                ts.forEachChild(sourceFile, (node) => {
                    if (ts.isVariableStatement(node)) {
                        const declaration =
                            node.declarationList.declarations[0];
                        if (
                            ts.isIdentifier(declaration.name) &&
                            declaration.name.text === 'storageSchema'
                        ) {
                            storageSchemaNode = declaration.initializer;
                        }
                    }
                });

                if (
                    !storageSchemaNode ||
                    !ts.isObjectLiteralExpression(storageSchemaNode)
                ) {
                    vscode.window.showErrorMessage(
                        '无法找到storageSchema或格式不正确'
                    );
                    return;
                }

                const importMap: { [key: string]: string } = {};

                ts.forEachChild(sourceFile, (node) => {
                    if (ts.isImportDeclaration(node)) {
                        const moduleSpecifier = node.moduleSpecifier;
                        if (ts.isStringLiteral(moduleSpecifier)) {
                            const importPath = moduleSpecifier.text;
                            const importClause = node.importClause;
                            if (
                                importClause &&
                                importClause.namedBindings &&
                                ts.isNamedImports(importClause.namedBindings)
                            ) {
                                importClause.namedBindings.elements.forEach(
                                    (element) => {
                                        if (
                                            element.propertyName &&
                                            element.propertyName.text === 'desc'
                                        ) {
                                            importMap[element.name.text] =
                                                importPath;
                                        }
                                    }
                                );
                            }
                        }
                    }
                });

                storageSchemaNode.properties.forEach((prop) => {
                    if (
                        ts.isPropertyAssignment(prop) &&
                        ts.isIdentifier(prop.name)
                    ) {
                        const entityName = prop.name.text;
                        if (ts.isIdentifier(prop.initializer)) {
                            const descName = prop.initializer.text;
                            const importPath = importMap[descName];
                            if (importPath) {
                                const resolvedPath = resolveImportPath(
                                    importPath,
                                    dirname(storageFile)
                                );
                                const descObject = parseDescFile(
                                    resolvedPath,
                                    program
                                );
                                const schemaFile = join(
                                    resolvedPath,
                                    '../Schema.ts'
                                );
                                const projectionList = parseSchemaFile(
                                    schemaFile,
                                    program
                                );
                                if (descObject) {
                                    entityDict[entityName] = {
                                        ...descObject,
                                        projectionList,
                                    };
                                }
                            } else {
                                vscode.window.showWarningMessage(
                                    `未找到 ${descName} 的导入路径`
                                );
                            }
                        } else {
                            vscode.window.showWarningMessage(
                                `${entityName} 的值不是预期的标识符`
                            );
                        }
                    }
                });
                console.log('entityDict:', entityDict);
                isAnalyzing = false;
                resolve();
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
