import * as vscode from 'vscode';
import * as ts from 'typescript';
import { normalizePath, pathConfig } from './paths';
import { dirname, join } from 'path';
import { createProjectProgram } from './ts-utils';
import { TriggerDef, TriggerInfo } from '../types';
import fs from 'fs';
import { debounce, random } from 'lodash';
import { getLevel, notIgnore } from './oakConfig';

/**
 * 记录主文件当前的trigger程序
 */
let triggerProgram: ts.Program | null = null;
/**
 * 记录所有的trigger
 */
let triggers: TriggerDef[] = [];
/**
 * 记录在主文件中的导入信息
 */
let filePathToImportName: {
    [filePath: string]: {
        importName: string;
        identifier: string;
        isDefault: boolean;
    };
} = {};

export const initTriggerProgram = () => {
    triggerProgram = null;
    triggers = [];
    filePathToImportName = {};
    const open = createProjectProgram(join(pathConfig.triggerHome, 'index.ts'));
    if (!open) {
        console.error('trigger program init failed');
        return;
    }
    triggerProgram = open;
    triggers = getDefaultExport(triggerProgram, pathConfig.triggerHome);
    updateDeounced();
};

// 下面用于搜索trigger
// 妈的这个方法怎么看起来这么优雅，递归就可以解决无限种情况，不知道我怎么写出来的
function resolveImportedTriggers(
    node: ts.Node,
    typeChecker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    program: ts.Program,
    visited: Set<string> = new Set()
): TriggerDef[] {
    if (ts.isSpreadElement(node)) {
        return resolveImportedTriggers(
            node.expression,
            typeChecker,
            sourceFile,
            program,
            visited
        );
    }

    if (ts.isIdentifier(node)) {
        const name = node.getText();
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.declarations && symbol.declarations.length > 0) {
            const declaration = symbol.declarations[0];
            if (ts.isImportClause(declaration)) {
                // 检查是否为命名导入，还是默认导入

                let named: ts.ImportSpecifier | undefined;

                ts.forEachChild(declaration, (child) => {
                    if (ts.isNamedImports(child)) {
                        named = child.elements.find(
                            (element) => element.name.getText() === name
                        );
                    }
                });

                if (named) {
                    const importClause = named.parent.parent;
                    const importPath = importClause.parent.moduleSpecifier
                        .getText(sourceFile)
                        .slice(1, -1);

                    const importMeta = {
                        // 在目标文件中的名称
                        identifier: '',
                        // 导入到当前文件的名称
                        importName: '',
                        isDefault: false,
                    };

                    ts.forEachChild(importClause, (child) => {
                        if (ts.isNamedImports(child)) {
                            child.elements.forEach((element) => {
                                if (element.name.getText() === node.getText()) {
                                    importMeta.identifier =
                                        element.name.getText();
                                    importMeta.importName = element.propertyName
                                        ? element.propertyName.getText()
                                        : element.name.getText();
                                }
                            });
                        } else if (ts.isNamespaceImport(child)) {
                            importMeta.identifier = child.name.getText();
                            importMeta.importName = child.name.getText();
                        } else if (ts.isImportSpecifier(child)) {
                            if (child.name.getText() === node.getText()) {
                                importMeta.identifier = child.name.getText();
                                importMeta.importName = child.propertyName
                                    ? child.propertyName.getText()
                                    : child.name.getText();
                            }
                        }
                    });

                    const resolvedPath = join(
                        dirname(sourceFile.fileName),
                        importPath
                    );

                    if (visited.has(resolvedPath)) {
                        return []; // 防止循环引用
                    }
                    visited.add(resolvedPath);

                    const importedSourceFile = program.getSourceFile(
                        resolvedPath.endsWith('.ts')
                            ? resolvedPath
                            : resolvedPath + '.ts'
                    );
                    if (importedSourceFile) {
                        return getTriggersFromSourceFile(
                            importedSourceFile,
                            typeChecker,
                            program,
                            visited,
                            importMeta
                        );
                    }
                } else {
                    if (!declaration.name) {
                        console.log('declaration name not found');
                    } else {
                        // 这里是默认导入
                        const importDeclaration = declaration.parent;
                        const name = declaration.name.getText();
                        const meta = {
                            identifier: name,
                            importName: name,
                            isDefault: true,
                        };
                        const importPath =
                            importDeclaration.moduleSpecifier.getText(
                                sourceFile
                            );
                        const resolvedPath = join(
                            dirname(sourceFile.fileName),
                            importPath.slice(1, -1)
                        );
                        if (visited.has(resolvedPath)) {
                            return [];
                        }
                        visited.add(resolvedPath);
                        const importedSourceFile = program.getSourceFile(
                            resolvedPath.endsWith('.ts')
                                ? resolvedPath
                                : resolvedPath + '.ts'
                        );
                        if (importedSourceFile) {
                            return getTriggersFromSourceFile(
                                importedSourceFile,
                                typeChecker,
                                program,
                                visited,
                                meta
                            );
                        }
                    }
                }
            } else if (ts.isImportSpecifier(declaration)) {
                // 这里是命名导入
                const importClause = declaration.parent.parent;
                const importPath =
                    importClause.parent.moduleSpecifier.getText(sourceFile);

                const importMeta = {
                    identifier: '',
                    importName: '',
                    isDefault: false,
                };

                ts.forEachChild(importClause, (child) => {
                    if (ts.isNamedImports(child)) {
                        child.elements.forEach((element) => {
                            if (element.name.getText() === node.getText()) {
                                importMeta.identifier = element.name.getText();
                                importMeta.importName = element.propertyName
                                    ? element.propertyName.getText()
                                    : element.name.getText();
                            }
                        });
                    } else if (ts.isNamespaceImport(child)) {
                        importMeta.identifier = child.name.getText();
                        importMeta.importName = child.name.getText();
                    } else if (ts.isImportSpecifier(child)) {
                        if (child.name.getText() === node.getText()) {
                            importMeta.identifier = child.name.getText();
                            importMeta.importName = child.propertyName
                                ? child.propertyName.getText()
                                : child.name.getText();
                        }
                    }
                });

                const resolvedPath = join(
                    dirname(sourceFile.fileName),
                    importPath.slice(1, -1)
                );

                if (visited.has(resolvedPath)) {
                    return []; // 防止循环引用
                }
                visited.add(resolvedPath);

                const importedSourceFile = program.getSourceFile(
                    resolvedPath.endsWith('.ts')
                        ? resolvedPath
                        : resolvedPath + '.ts'
                );
                if (importedSourceFile) {
                    return getTriggersFromSourceFile(
                        importedSourceFile,
                        typeChecker,
                        program,
                        visited,
                        importMeta
                    );
                }
            } else if (
                ts.isVariableDeclaration(declaration) &&
                declaration.initializer
            ) {
                return resolveImportedTriggers(
                    declaration.initializer,
                    typeChecker,
                    sourceFile,
                    program,
                    visited
                );
            }
        }
    }

    if (ts.isAsExpression(node)) {
        return resolveImportedTriggers(
            node.expression,
            typeChecker,
            sourceFile,
            program,
            visited
        );
    }

    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.flatMap((element) =>
            resolveImportedTriggers(
                element,
                typeChecker,
                sourceFile,
                program,
                visited
            )
        );
    }

    if (ts.isObjectLiteralExpression(node)) {
        return [analyzeTriggerObj(node, sourceFile, program)];
    }

    return [];
}

/**
 *  分析trigger对象
 * @param node  trigger对象
 * @param sourceFile  trigger所在的文件
 * @param program  ts程序
 * @param typeChecker   类型检查器
 * @returns trigger定义
 */
const analyzeTriggerObj = (
    node: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    program: ts.Program
) => {
    const def: TriggerDef = {
        path: normalizePath(sourceFile.fileName),
        name: '',
        entity: '',
        action: [],
        when: '',
        cs: false,
        tsInfo: {
            sourceFile,
            program,
            typeChecker: program.getTypeChecker(),
            node,
        },
    };

    ts.forEachChild(node, (child) => {
        if (ts.isPropertyAssignment(child)) {
            const key = child.name.getText();
            if (ts.isStringLiteral(child.initializer)) {
                const value = child.initializer;
                if (key === 'name') {
                    def.name = value.text;
                } else if (key === 'entity') {
                    def.entity = value.text;
                } else if (key === 'action') {
                    def.action = [value.text];
                } else if (key === 'when') {
                    def.when = value.text;
                } else if (key === 'asRoot') {
                    def.asRoot = !!child.initializer;
                } else if (key === 'priority') {
                    def.priority = parseInt(value.text);
                } else if (key === 'cs') {
                    def.cs = !!child.initializer;
                }
            } else if (ts.isArrayLiteralExpression(child.initializer)) {
                if (key === 'action') {
                    def.action = child.initializer.elements.map((element) => {
                        if (ts.isStringLiteral(element)) {
                            return element.text;
                        }
                        return '';
                    });
                }
            }
        }
    });

    return def;
};

/**
 *  从源文件中查找triggers定义
 * @param sourceFile  源文件
 * @param typeChecker  类型检查器
 * @param program  ts程序
 * @param visited  访问过的文件
 * @param meta  导入信息
 * @returns  triggers定义
 */
function getTriggersFromSourceFile(
    sourceFile: ts.SourceFile,
    typeChecker: ts.TypeChecker,
    program: ts.Program,
    visited: Set<string> = new Set(),
    meta: {
        identifier: string;
        importName: string;
        isDefault: boolean;
    }
): TriggerDef[] {
    let triggers: TriggerDef[] = [];

    // 记录一下文件路径和导入的名称的对应关系
    filePathToImportName[normalizePath(sourceFile.fileName)] = {
        importName: meta.importName,
        identifier: meta.identifier,
        isDefault: meta.isDefault,
    };

    ts.forEachChild(sourceFile, (node) => {
        if (!meta.isDefault) {
            if (ts.isVariableStatement(node)) {
                const declaration = node.declarationList.declarations[0];
                if (
                    ts.isVariableDeclaration(declaration) &&
                    declaration.name.getText() === meta.importName &&
                    declaration.initializer
                ) {
                    triggers = resolveImportedTriggers(
                        declaration.initializer,
                        typeChecker,
                        sourceFile,
                        program,
                        visited
                    );
                }
            }
        } else {
            // 找export default的变量，继续递归
            ts.forEachChild(sourceFile, (node) => {
                if (ts.isExportAssignment(node) && !node.isExportEquals) {
                    // 找到 export default 语句
                    if (ts.isIdentifier(node.expression)) {
                        // 如果 default export 是一个标识符
                        const symbol = typeChecker.getSymbolAtLocation(
                            node.expression
                        );
                        if (
                            symbol &&
                            symbol.declarations &&
                            symbol.declarations.length > 0
                        ) {
                            const declaration = symbol.declarations[0];
                            if (
                                ts.isVariableDeclaration(declaration) &&
                                declaration.initializer
                            ) {
                                triggers = resolveImportedTriggers(
                                    declaration.initializer,
                                    typeChecker,
                                    sourceFile,
                                    program,
                                    visited
                                );
                            }
                        }
                    } else {
                        // 如果 default export 直接是一个表达式
                        triggers = resolveImportedTriggers(
                            node.expression,
                            typeChecker,
                            sourceFile,
                            program,
                            visited
                        );
                    }
                }
            });
        }
    });

    return triggers;
}

/**
 *  获取默认导出的trigger
 * @param program  ts程序
 * @param sourcePath  源文件路径
 * @returns  triggers定义
 */
const getDefaultExport = (
    program: ts.Program | undefined,
    sourcePath: string
): TriggerDef[] => {
    if (!program) {
        console.error('program not initialized');
        return [];
    }

    const sourceFile = program.getSourceFile(join(sourcePath, 'index.ts'));
    if (!sourceFile) {
        console.error('Source file not found');
        return [];
    }

    const typeChecker = program.getTypeChecker();
    let defaultExportIdentifier: ts.Identifier | undefined;

    // 查找默认导出
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isExportAssignment(node) && !node.isExportEquals) {
            if (ts.isIdentifier(node.expression)) {
                defaultExportIdentifier = node.expression;
            }
        }
    });

    if (!defaultExportIdentifier) {
        console.error('Default export not found');
        return [];
    }

    const symbol = typeChecker.getSymbolAtLocation(defaultExportIdentifier);
    if (!symbol) {
        console.error('Symbol for default export not found');
        return [];
    }

    const declaration =
        symbol.valueDeclaration ||
        (symbol.declarations && symbol.declarations[0]);
    if (!declaration) {
        console.error('Declaration for default export not found');
        return [];
    }

    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return resolveImportedTriggers(
            declaration.initializer,
            typeChecker,
            sourceFile,
            program
        );
    }

    console.error('Unable to resolve default export');
    return [];
};

/**
 * 这里为了防止频繁扫描导致的性能损耗，并且如果不及时更新可能会导致一些问题
 * 所以这里设置一个计数器，当更新次数超过一定值时，重新扫描全部trigger
 */
let updateCount = 0;
// 下面进行trigger的更新
export const updateTriggerByPath = (path: string) => {
    updateCount++;

    const norPath = normalizePath(path);

    if(!norPath.startsWith(pathConfig.triggerHome)){
        return;
    }

    if (!triggerProgram) {
        console.error('trigger program not initialized');
        return;
    }

    const maxCount = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('triggerUpdateCount', 30);
    if (updateCount > maxCount) {
        console.log('更新次数过多，将重新扫描全部trigger');
        initTriggerProgram();
        return;
    }

    // 读取文件的新内容
    const fileContent = fs.readFileSync(norPath, 'utf-8');

    // 创建新的 CompilerHost
    const compilerHost = ts.createCompilerHost(
        triggerProgram.getCompilerOptions()
    );

    // 创建一个新的 SourceFile
    const languageVersion =
        triggerProgram.getCompilerOptions().target || ts.ScriptTarget.Latest;
    const newSourceFile = ts.createSourceFile(
        norPath,
        fileContent,
        languageVersion
    );

    // 创建新的 Program
    triggerProgram = ts.createProgram({
        rootNames: triggerProgram.getRootFileNames(),
        options: triggerProgram.getCompilerOptions(),
        host: {
            ...compilerHost,
            getSourceFile: (
                fileName,
                languageVersion,
                onError,
                shouldCreateNewSourceFile
            ) => {
                const normalizedFileName = normalizePath(fileName);
                if (normalizedFileName === norPath) {
                    return newSourceFile;
                }
                return compilerHost.getSourceFile(
                    fileName,
                    languageVersion,
                    onError,
                    shouldCreateNewSourceFile
                );
            },
        },
        oldProgram: triggerProgram,
    });

    // 获取更新后的 SourceFile
    const updatedSourceFile = triggerProgram.getSourceFile(norPath);
    if (!updatedSourceFile) {
        console.error('Updated trigger source file not found:', norPath);
        return;
    }

    // 更新 triggers
    const typeChecker = triggerProgram.getTypeChecker();
    const importMeta = filePathToImportName[norPath];

    if (!importMeta) {
        console.log(
            '没有找到该文件对应的导入信息，将重新扫描全部trigger',
            norPath
        );
        initTriggerProgram();
        return;
    }

    // 移除旧的 triggers
    triggers = triggers.filter((trigger) => trigger.path !== norPath);

    // 添加新的 triggers
    const newTriggers = getTriggersFromSourceFile(
        updatedSourceFile,
        typeChecker,
        triggerProgram,
        new Set(),
        {
            identifier: importMeta.identifier,
            importName: importMeta.importName,
            isDefault: importMeta.isDefault,
        }
    );

    triggers.push(...newTriggers);

    updateDeounced();
};

/**
 *  检查trigger
 * @param trigger  trigger定义
 * @returns  返回uri和诊断信息
 */
export const checkTrigger = (
    trigger: TriggerDef
): {
    uri: string;
    diagnostics: vscode.Diagnostic[];
} => {
    const diagnostics: vscode.Diagnostic[] = [];
    const checkFn = (node: ts.Node): void => {
        const fnMeta: {
            block: ts.Block | undefined;
            contextIdentifier: string | undefined;
        } = {
            block: undefined,
            contextIdentifier: undefined,
        };
        ts.forEachChild(node, (child) => {
            if (
                ts.isPropertyAssignment(child) &&
                child.name.getText() === 'fn'
            ) {
                ts.forEachChild(child, (c) => {
                    if (ts.isFunctionExpression(c) || ts.isArrowFunction(c)) {
                        // 检查是否为async
                        if (c.modifiers) {
                            const isAsync = c.modifiers.find(
                                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                            );
                            if (!isAsync) {
                                notIgnore('trigger.onNoAsyncFn') &&
                                    diagnostics.push(
                                        createDiagnostic(
                                            trigger.tsInfo.sourceFile,
                                            c.getStart(),
                                            c.getEnd(),
                                            'trigger.invalidAsync',
                                            'fn必须是async',
                                            getLevel('trigger.onNoAsyncFn')
                                        )
                                    );
                            }
                        } else {
                            notIgnore('trigger.onNoAsyncFn') &&
                                diagnostics.push(
                                    createDiagnostic(
                                        trigger.tsInfo.sourceFile,
                                        c.getStart(),
                                        c.getEnd(),
                                        'trigger.invalidAsync',
                                        'fn必须是async',
                                        getLevel('trigger.onNoAsyncFn')
                                    )
                                );
                        }
                        fnMeta.block = c.forEachChild((c) => {
                            if (ts.isBlock(c)) {
                                return c;
                            }
                        });
                        // contextIdentifier是函数的第二个参数
                        if (c.parameters.length > 1) {
                            const context = c.parameters[1];
                            if (ts.isIdentifier(context.name)) {
                                fnMeta.contextIdentifier =
                                    context.name.getText();
                            }
                        }
                    }
                });
            } else if (
                ts.isMethodDeclaration(child) &&
                child.name.getText() === 'fn'
            ) {
                // 这里要单独检查
                const async = child.modifiers?.find(
                    (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                );
                if (!async) {
                    notIgnore('trigger.onNoAsyncFn') &&
                        diagnostics.push(
                            createDiagnostic(
                                trigger.tsInfo.sourceFile,
                                child.getStart(),
                                child.getEnd(),
                                'trigger.invalidAsync',
                                'fn必须是async',
                                getLevel('trigger.onNoAsyncFn')
                            )
                        );
                }
                // 检查函数体的内容
                fnMeta.block = child.body;
                // contextIdentifier是函数的第二个参数
                if (child.parameters.length > 1) {
                    const context = child.parameters[1];
                    if (ts.isIdentifier(context.name)) {
                        fnMeta.contextIdentifier = context.name.getText();
                    }
                }
            }
        });
        const walkBlock = (block: ts.Node) => {
            ts.forEachChild(block, (child) => {
                if (ts.isReturnStatement(child)) {
                    // 如果没有返回值
                    if (!child.expression) {
                        if (trigger.when === 'commit') {
                            // commit的情况下不需要返回值
                        } else {
                            if (!trigger.cs) {
                                // 非跨事务的情况下必须返回执行结果
                                diagnostics.push(
                                    createDiagnostic(
                                        trigger.tsInfo.sourceFile,
                                        child.getStart(),
                                        child.getEnd(),
                                        'trigger.invalidReturn',
                                        '非commit的trigger必须返回执行结果'
                                    )
                                );
                            }
                        }
                    } else {
                        // 检查是否直接返回了一个字面量
                        if (
                            ts.isNumericLiteral(child.expression) ||
                            ts.isStringLiteral(child.expression) ||
                            ts.isObjectLiteralExpression(child.expression)
                        ) {
                            // 如果返回值是0，就跳过
                            if (ts.isNumericLiteral(child.expression)) {
                                if (child.expression.text === '0') {
                                    return;
                                }
                            }
                            notIgnore('trigger.onReturnLiteral') &&
                                diagnostics.push(
                                    createDiagnostic(
                                        trigger.tsInfo.sourceFile,
                                        child.getStart(),
                                        child.getEnd(),
                                        'trigger.invalidReturn',
                                        'trigger应该返回执行结果，而不是字面量',
                                        getLevel('trigger.onReturnLiteral')
                                    )
                                );
                        }
                    }
                }

                // 如果是一个block，递归其内部的内容
                if (ts.isBlock(child)) {
                    ts.forEachChild(child, (c) => {
                        walkBlock(c);
                    });
                }

                // 如果是if或者switch，继续递归
                if (ts.isIfStatement(child)) {
                    walkBlock(child.thenStatement);
                    if (child.elseStatement) {
                        walkBlock(child.elseStatement);
                    }
                } else if (ts.isSwitchStatement(child)) {
                    child.caseBlock.clauses.forEach((clause) => {
                        clause.statements.forEach((statement) => {
                            walkBlock(statement);
                        });
                    });
                }

                // 其他可以return的情况应该没有了，先写这么多
                // 下面是fn内部的context调用

                if (ts.isVariableStatement(child)) {
                    walkBlock(child.declarationList);
                    ts.forEachChild(child.declarationList, (declaration) => {
                        walkBlock(declaration);
                    });
                }
                if (ts.isVariableDeclaration(child)) {
                    if (child.initializer) {
                        walkBlock(child.initializer);
                    }
                }
                if (ts.isAwaitExpression(child)) {
                    walkBlock(child.expression);
                }
                if (ts.isExpressionStatement(child)) {
                    walkBlock(child.expression);
                }
                if (
                    ts.isForInStatement(child) ||
                    ts.isForOfStatement(child) ||
                    ts.isForStatement(child)
                ) {
                    walkBlock(child.statement);
                    ts.forEachChild(child.statement, (c) => {
                        walkBlock(c);
                    });
                }
                if (ts.isWhileStatement(child)) {
                    walkBlock(child.statement);
                }
                if (ts.isTryStatement(child)) {
                    walkBlock(child.tryBlock);
                    if (child.catchClause) {
                        walkBlock(child.catchClause.block);
                    }
                    if (child.finallyBlock) {
                        walkBlock(child.finallyBlock);
                    }
                }
                if (ts.isExpressionStatement(child)) {
                    walkBlock(child.expression);
                }
                if (ts.isCallExpression(child)) {
                    // 这里判断一下是不是context.xxx的调用
                    const expression = child.expression;
                    if (ts.isPropertyAccessExpression(expression)) {
                        // 如果是context.xxx的调用
                        // 判断一下context的类型名称是不是BackendRuntimeContext
                        // const typeChecker = trigger.tsInfo.typeChecker;
                        // const type = typeChecker.getTypeAtLocation(
                        //     expression.expression
                        // );
                        // const typeName = typeChecker.typeToString(type);
                        // if (typeName.includes('BackendRuntimeContext')) {
                        //     // // 无论如何显示一个警告先，debug
                        //     // diagnostics.push(
                        //     //     createDiagnostic(
                        //     //         trigger.tsInfo.sourceFile,
                        //     //         child.getStart(),
                        //     //         child.getEnd(),
                        //     //         'trigger.invalidContextCall',
                        //     //         'test warning',
                        //     //         vscode.DiagnosticSeverity.Warning
                        //     //     )
                        //     // );
                        //     // 检查是不是await的调用，否则出现警告
                        //     const parent = child.parent;
                        //     if (
                        //         !ts.isAwaitExpression(parent) &&
                        //         !ts.isReturnStatement(parent)
                        //     ) {
                        //         // 获取方法调用的类型信息
                        //         const signature =
                        //             typeChecker.getResolvedSignature(child);
                        //         if (!signature) {
                        //             return;
                        //         }
                        //         const returnType =
                        //             typeChecker.getReturnTypeOfSignature(
                        //                 signature
                        //             );
                        //         const returnTypeString =
                        //             typeChecker.typeToString(returnType);
                        //         if (!isPromiseType(returnType, typeChecker)) {
                        //             // 如果返回值是Promise类型，那么就是正确的
                        //             return;
                        //         }
                        //         diagnostics.push(
                        //             createDiagnostic(
                        //                 trigger.tsInfo.sourceFile,
                        //                 child.getStart(),
                        //                 child.getEnd(),
                        //                 'trigger.invalidContextCall',
                        //                 'context调用应该使用await',
                        //                 vscode.DiagnosticSeverity.Warning
                        //             )
                        //         );
                        //     }
                        // }
                        if (
                            expression.expression.getText() ===
                            fnMeta.contextIdentifier
                        ) {
                            const parent = child.parent;
                            if (
                                !ts.isAwaitExpression(parent) &&
                                !ts.isReturnStatement(parent)
                            ) {
                                // 现在只检查select， operate， commit，rollback
                                if (
                                    ![
                                        'select',
                                        'operate',
                                        'commit',
                                        'rollback',
                                        'aggregate',
                                        'count',
                                        'exec',
                                        'begin',
                                        'on',
                                    ].includes(expression.name.getText())
                                ) {
                                    return;
                                }
                                notIgnore('trigger.onNoAwaitContext') &&
                                    diagnostics.push(
                                        createDiagnostic(
                                            trigger.tsInfo.sourceFile,
                                            child.getStart(),
                                            child.getEnd(),
                                            'trigger.invalidContextCall',
                                            'context调用应该使用await',
                                            getLevel('trigger.onNoAwaitContext')
                                        )
                                    );
                            }
                        }
                    }
                }
            });
        };
        if (fnMeta.block) {
            walkBlock(fnMeta.block);
        }
    };

    checkFn(trigger.tsInfo.node);

    return {
        uri: trigger.path,
        diagnostics,
    };
};

/**
 *  创建诊断信息
 * @param sourceFile  源文件
 * @param start  开始位置
 * @param end  结束位置
 * @param key  诊断key
 * @param message   诊断信息
 * @param level  诊断级别
 * @returns     诊断信息
 */
const createDiagnostic = (
    sourceFile: ts.SourceFile,
    start: number,
    end: number,
    key: string,
    message: string,
    level: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error
): vscode.Diagnostic => {
    const startPos = ts.getLineAndCharacterOfPosition(sourceFile, start);
    const endPos = ts.getLineAndCharacterOfPosition(sourceFile, end);
    const dia = new vscode.Diagnostic(
        {
            start: {
                line: startPos.line,
                character: startPos.character,
            } as vscode.Position,
            end: {
                line: endPos.line,
                character: endPos.character,
            } as vscode.Position,
        } as vscode.Range,
        message,
        level
    );

    dia.code = key;
    return dia;
};

/**
 *  检查所有的trigger
 * @returns  返回uri和诊断信息
 */
export const checkAllTriggers = (): {
    [uri: string]: vscode.Diagnostic[];
} => {
    if (!triggerProgram) {
        console.error('trigger program not initialized');
        return {};
    }
    return checkTriggers(triggers);
};

/**
 *  检查所有的trigger
 * @param ts  trigger定义
 * @returns  返回uri和诊断信息
 */
export const checkTriggers = (ts: TriggerDef[]) => {
    const diagnostics: {
        [uri: string]: vscode.Diagnostic[];
    } = {};
    ts.map((t) => {
        const result = checkTrigger(t);
        if (diagnostics[result.uri]) {
            diagnostics[result.uri].push(...result.diagnostics);
        } else {
            diagnostics[result.uri] = result.diagnostics;
        }
    });
    return diagnostics;
};

/**
 *  检查指定路径的trigger
 * @param path  路径
 * @returns   返回路径和诊断信息
 */
export const checkPathTrigger = (path: string) => {
    const norPath = normalizePath(path);
    const trigger = triggers.filter((t) => t.path === norPath);
    if (!trigger) {
        console.error('trigger not found');
        return;
    }
    const res = checkTriggers(trigger);
    const diagnostics: vscode.Diagnostic[] = [];
    Object.keys(res).forEach((uri) => {
        diagnostics.push(...res[uri]);
    });
    return {
        path: norPath,
        diagnostics,
    };
};

/**
 *  获取某一个entity的trigger数量
 * @param entity  entity名称
 * @returns  trigger数量
 */
export const getTriggerCountByEntity = (entity: string): number => {
    return triggers.filter((t) => t.entity === entity).length;
};

/**
 *  获取某一个entity的trigger信息
 * @param entity  entity名称
 * @returns  trigger信息
 */
export const getTrigersInfoByEntity = (entity: string): TriggerInfo[] => {
    return triggers
        .filter((t) => t.entity === entity)
        .map((t) => {
            return {
                name: t.name,
                when: t.when,
                action: t.action,
                entity: t.entity,
                path: t.path,
                pos: {
                    start: t.tsInfo.node.getStart(),
                    end: t.tsInfo.node.getEnd(),
                },
            };
        });
};

// 发布订阅trigger的更新
const triggerSubscribers: Map<number, () => void> = new Map();

const updateDeounced = debounce(() => {
    triggerSubscribers.forEach((callback) => callback());
}, 200);

/**
 *  订阅trigger的更新，当trigger更新时，会调用callback
 * @param callback  回调函数
 * @returns  返回一个取消订阅的函数
 */
export const subscribeTrigger = (callback: () => void) => {
    const setToSubscribers = (callback: () => void) => {
        const key = random(0, 100000);
        if (triggerSubscribers.has(key)) {
            return setToSubscribers(callback);
        }
        triggerSubscribers.set(key, callback);
        return key;
    };

    const key = setToSubscribers(callback);

    return () => {
        triggerSubscribers.delete(key);
    };
};
