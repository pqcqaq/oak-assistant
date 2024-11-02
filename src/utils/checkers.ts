import * as vscode from 'vscode';
import * as ts from 'typescript';
import { normalizePath, pathConfig } from './paths';
import { dirname, join } from 'path';
import { createProjectProgram } from './ts-utils';
import { CheckerDef, CheckerInfo } from '../types';
import fs from 'fs';
import { debounce, random } from 'lodash';

/**
 * 记录主文件当前的checker程序
 */
let checkerProgram: ts.Program | null = null;
/**
 * 记录所有的checker
 */
let checkers: CheckerDef[] = [];
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

export const initCheckerProgram = () => {
    checkerProgram = null;
    checkers = [];
    filePathToImportName = {};
    const open = createProjectProgram(join(pathConfig.checkerHome, 'index.ts'));
    if (!open) {
        console.error('checker program init failed');
        return;
    }
    checkerProgram = open;
    checkers = getDefaultExport(checkerProgram, pathConfig.checkerHome);
    updateDeounced();
};

// 下面用于搜索checker
function resolveImportedCheckers(
    node: ts.Node,
    typeChecker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    program: ts.Program,
    visited: Set<string> = new Set()
): CheckerDef[] {
    if (ts.isSpreadElement(node)) {
        return resolveImportedCheckers(
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
                        return getCheckersFromSourceFile(
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
                            return getCheckersFromSourceFile(
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
                    return getCheckersFromSourceFile(
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
                return resolveImportedCheckers(
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
        return resolveImportedCheckers(
            node.expression,
            typeChecker,
            sourceFile,
            program,
            visited
        );
    }

    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.flatMap((element) =>
            resolveImportedCheckers(
                element,
                typeChecker,
                sourceFile,
                program,
                visited
            )
        );
    }

    if (ts.isObjectLiteralExpression(node)) {
        return [analyzeCheckerObj(node, sourceFile, program)];
    }

    return [];
}

/**
 *  分析checker对象
 * @param node  checker对象
 * @param sourceFile  checker所在的文件
 * @param program  ts程序
 * @param typeChecker   类型检查器
 * @returns checker定义
 */
const analyzeCheckerObj = (
    node: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    program: ts.Program
) => {
    const def: CheckerDef = {
        type: 'row',
        path: normalizePath(sourceFile.fileName),
        entity: '',
        action: [],
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
                if (key === 'entity') {
                    def.entity = value.text;
                } else if (key === 'action') {
                    def.action = [value.text];
                } else if (key === 'priority') {
                    def.priority = parseInt(value.text);
                } else if (key === 'mt') {
                    def.mt = value.text as any;
                } else if (key === 'type') {
                    def.type = value.text as any;
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
 *  从源文件中查找checkers定义
 * @param sourceFile  源文件
 * @param typeChecker  类型检查器
 * @param program  ts程序
 * @param visited  访问过的文件
 * @param meta  导入信息
 * @returns  checkers定义
 */
function getCheckersFromSourceFile(
    sourceFile: ts.SourceFile,
    typeChecker: ts.TypeChecker,
    program: ts.Program,
    visited: Set<string> = new Set(),
    meta: {
        identifier: string;
        importName: string;
        isDefault: boolean;
    }
): CheckerDef[] {
    let checkers: CheckerDef[] = [];

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
                    checkers = resolveImportedCheckers(
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
                                checkers = resolveImportedCheckers(
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
                        checkers = resolveImportedCheckers(
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

    return checkers;
}

/**
 *  获取默认导出的checker
 * @param program  ts程序
 * @param sourcePath  源文件路径
 * @returns  checkers定义
 */
const getDefaultExport = (
    program: ts.Program | undefined,
    sourcePath: string
): CheckerDef[] => {
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
        return resolveImportedCheckers(
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
 * 所以这里设置一个计数器，当更新次数超过一定值时，重新扫描全部checker
 */
let updateCount = 0;
// 下面进行checker的更新
export const updateCheckerByPath = (path: string) => {
    updateCount++;

    const norPath = normalizePath(path);
    if (!checkerProgram) {
        console.error('checker program not initialized');
        return;
    }

    const maxCount = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('checkerUpdateCount', 30);
    if (updateCount > maxCount) {
        console.log('更新次数过多，将重新扫描全部checker');
        initCheckerProgram();
        return;
    }

    // 读取文件的新内容
    const fileContent = fs.readFileSync(norPath, 'utf-8');

    // 创建新的 CompilerHost
    const compilerHost = ts.createCompilerHost(
        checkerProgram.getCompilerOptions()
    );

    // 创建一个新的 SourceFile
    const languageVersion =
        checkerProgram.getCompilerOptions().target || ts.ScriptTarget.Latest;
    const newSourceFile = ts.createSourceFile(
        norPath,
        fileContent,
        languageVersion
    );

    // 创建新的 Program
    checkerProgram = ts.createProgram({
        rootNames: checkerProgram.getRootFileNames(),
        options: checkerProgram.getCompilerOptions(),
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
        oldProgram: checkerProgram,
    });

    // 获取更新后的 SourceFile
    const updatedSourceFile = checkerProgram.getSourceFile(norPath);
    if (!updatedSourceFile) {
        console.error('Updated source file not found');
        return;
    }

    // 更新 checkers
    const typeChecker = checkerProgram.getTypeChecker();
    const importMeta = filePathToImportName[norPath];

    if (!importMeta) {
        console.log(
            '没有找到该文件对应的导入信息，将重新扫描全部checker',
            norPath
        );
        initCheckerProgram();
        return;
    }

    // 移除旧的 checkers
    checkers = checkers.filter((checker) => checker.path !== norPath);

    // 添加新的 checkers
    const newCheckers = getCheckersFromSourceFile(
        updatedSourceFile,
        typeChecker,
        checkerProgram,
        new Set(),
        {
            identifier: importMeta.identifier,
            importName: importMeta.importName,
            isDefault: importMeta.isDefault,
        }
    );

    checkers.push(...newCheckers);

    updateDeounced();
};

/**
 *  检查checker
 * @param checker  checker定义
 * @returns  返回uri和诊断信息
 */
export const checkChecker = (
    checker: CheckerDef
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
                child.name.getText() === 'checker'
            ) {
                ts.forEachChild(child, (c) => {
                    if (ts.isFunctionExpression(c) || ts.isArrowFunction(c)) {
                        //     // 检查是否为async
                        //     if (c.modifiers) {
                        //         const isAsync = c.modifiers.find(
                        //             (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                        //         );
                        //         if (!isAsync) {
                        //             diagnostics.push(
                        //                 createDiagnostic(
                        //                     checker.tsInfo.sourceFile,
                        //                     c.getStart(),
                        //                     c.getEnd(),
                        //                     'checker.invalidAsync',
                        //                     'fn必须是async'
                        //                 )
                        //             );
                        //         }
                        //     } else {
                        //         diagnostics.push(
                        //             createDiagnostic(
                        //                 checker.tsInfo.sourceFile,
                        //                 c.getStart(),
                        //                 c.getEnd(),
                        //                 'checker.invalidAsync',
                        //                 'fn必须是async'
                        //             )
                        //         );
                        //     }
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
                child.name.getText() === 'checker'
            ) {
                // // 这里要单独检查
                // const async = child.modifiers?.find(
                //     (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                // );
                // if (!async) {
                //     diagnostics.push(
                //         createDiagnostic(
                //             checker.tsInfo.sourceFile,
                //             child.getStart(),
                //             child.getEnd(),
                //             'checker.invalidAsync',
                //             'fn必须是async'
                //         )
                //     );
                // }
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
                        // if (checker.when === 'commit') {
                        //     // commit的情况下不需要返回值
                        // } else {
                        //     if (!checker.cs) {
                        //         // 非跨事务的情况下必须返回执行结果
                        //         diagnostics.push(
                        //             createDiagnostic(
                        //                 checker.tsInfo.sourceFile,
                        //                 child.getStart(),
                        //                 child.getEnd(),
                        //                 'checker.invalidReturn',
                        //                 '非commit的checker必须返回执行结果'
                        //             )
                        //         );
                        //     }
                        // }
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
                            diagnostics.push(
                                createDiagnostic(
                                    checker.tsInfo.sourceFile,
                                    child.getStart(),
                                    child.getEnd(),
                                    'checker.invalidReturn',
                                    'checker应该返回执行结果，而不是字面量',
                                    vscode.DiagnosticSeverity.Warning
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
                        if (
                            expression.expression.getText() ===
                            fnMeta.contextIdentifier
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
                            const parent = child.parent;
                            // diagnostics.push(
                            //     createDiagnostic(
                            //         checker.tsInfo.sourceFile,
                            //         child.getStart(),
                            //         child.getEnd(),
                            //         'checker.invalidContextCall',
                            //         'context调用应该使用await',
                            //         vscode.DiagnosticSeverity.Warning
                            //     )
                            // );
                            if (ts.isReturnStatement(parent)) {
                                handleReturn(parent, diagnostics);
                            }
                            // VariableDeclaration
                            if (ts.isVariableDeclaration(parent)) {
                                handleVariable(parent, diagnostics);
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

    checkFn(checker.tsInfo.node);

    return {
        uri: checker.path,
        diagnostics,
    };
};

// 针对不同的代码块，要执行不同的操作，下面定义不同操作的函数，检查context调用的不同父情况
const handleReturn = (
    node: ts.ReturnStatement,
    diagnostics: vscode.Diagnostic[]
) => {
    // context的父节点是return，需要判断在哪里return的，这里先不管
};

const handleVariable = (
    node: ts.VariableDeclaration,
    diagnostics: vscode.Diagnostic[]
) => {
    // 首先，不能是{ans} 的解构或者[]的解构
    if (ts.isArrayBindingPattern(node.name) || ts.isObjectBindingPattern(node.name)) {
        diagnostics.push(
            createDiagnostic(
                node.getSourceFile(),
                node.getStart(),
                node.getEnd(),
                'checker.invalidDestruct',
                'Checker中的context调用不能是解构赋值',
                vscode.DiagnosticSeverity.Error
            )
        );
        return;
    }
    // context的父节点是变量声明，需要判断下面有没有identifter instanceof Promise的判断
    const identifier = node.name.getText();
    // 找到这个作用域的block(VariableDeclaration -> VariableDeclarationList -> VariableStatement -> Block)
    const block = node.parent.parent.parent;
    // debug一下内容
    const walkBlock = (block: ts.Node) => {
        let hasPromise = false;
        ts.forEachChild(block, (child) => {
            if (ts.isIfStatement(child)) {
                // 如果是if语句，判断条件是否是identifier instanceof Promise
                if (ts.isBinaryExpression(child.expression)) {
                    const left = child.expression.left;
                    const right = child.expression.right;
                    if (
                        ts.isIdentifier(left) &&
                        ts.isIdentifier(right) &&
                        left.getText() === identifier &&
                        right.getText() === 'Promise'
                    ) {
                        hasPromise = true;
                        return;
                    }
                }
            }

            if (ts.isBlock(child)) {
                walkBlock(child);
            }
        });
        if (!hasPromise) {
            diagnostics.push(
                createDiagnostic(
                    node.getSourceFile(),
                    node.getStart(),
                    node.getEnd(),
                    'checker.invalidPromise',
                    'context调用需要判断是否为Promise',
                    vscode.DiagnosticSeverity.Error
                )
            );
        }
    };
    walkBlock(block);
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
 *  检查所有的checker
 * @returns  返回uri和诊断信息
 */
export const checkAllCheckers = (): {
    [uri: string]: vscode.Diagnostic[];
} => {
    if (!checkerProgram) {
        console.error('checker program not initialized');
        return {};
    }
    return checkCheckers(checkers);
};

/**
 *  检查所有的checker
 * @param ts  checker定义
 * @returns  返回uri和诊断信息
 */
export const checkCheckers = (ts: CheckerDef[]) => {
    const diagnostics: {
        [uri: string]: vscode.Diagnostic[];
    } = {};
    ts.map((t) => {
        const result = checkChecker(t);
        if (diagnostics[result.uri]) {
            diagnostics[result.uri].push(...result.diagnostics);
        } else {
            diagnostics[result.uri] = result.diagnostics;
        }
    });
    return diagnostics;
};

/**
 *  检查指定路径的checker
 * @param path  路径
 * @returns   返回路径和诊断信息
 */
export const checkPathChecker = (path: string) => {
    const norPath = normalizePath(path);
    const checker = checkers.filter((t) => t.path === norPath);
    if (!checker) {
        console.error('checker not found');
        return;
    }
    const res = checkCheckers(checker);
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
 *  获取某一个entity的checker数量
 * @param entity  entity名称
 * @returns  checker数量
 */
export const getCheckerCountByEntity = (entity: string): number => {
    return checkers.filter((t) => t.entity === entity).length;
};

/**
 *  获取某一个entity的checker信息
 * @param entity  entity名称
 * @returns  checker信息
 */
export const getTrigersInfoByEntity = (entity: string): CheckerInfo[] => {
    return checkers
        .filter((t) => t.entity === entity)
        .map((t) => {
            return {
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

// 发布订阅checker的更新
const checkerSubscribers: Map<number, () => void> = new Map();

const updateDeounced = debounce(() => {
    checkerSubscribers.forEach((callback) => callback());
}, 200);

/**
 *  订阅checker的更新，当checker更新时，会调用callback
 * @param callback  回调函数
 * @returns  返回一个取消订阅的函数
 */
export const subscribeChecker = (callback: () => void) => {
    const setToSubscribers = (callback: () => void) => {
        const key = random(0, 100000);
        if (checkerSubscribers.has(key)) {
            return setToSubscribers(callback);
        }
        checkerSubscribers.set(key, callback);
        return key;
    };

    const key = setToSubscribers(callback);

    return () => {
        checkerSubscribers.delete(key);
    };
};
