import * as ts from 'typescript';
import { pathConfig } from './paths';
import { dirname, join } from 'path';
import { createProjectProgram } from './ts-utils';
import { TriggerDef } from '../types';

let triggerProgram: ts.Program | null = null;

export const initTriggerProgram = () => {
    const open = createProjectProgram(join(pathConfig.triggerHome, 'index.ts'));
    if (!open) {
        console.error('trigger program init failed');
        return;
    }
    triggerProgram = open;
    const res = getDefaultExport();
    console.log('trigger program inited:', res);
};

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
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.declarations && symbol.declarations.length > 0) {
            const declaration = symbol.declarations[0];
            if (
                ts.isImportSpecifier(declaration) ||
                ts.isImportClause(declaration)
            ) {
                const importClause = declaration.parent
                    .parent as ts.ImportClause;
                //ImportDeclaration
                //   ImportClause
                //      NamedImports
                //          ImportSpecifier
                //              Identifier
                //              Identifier
                //    StringLiteral
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
        const def: TriggerDef = {
            name: '',
            entity: '',
            action: [],
            when: '',
            tsInfo: {
                sourceFile,
                program,
                typeChecker,
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
                    }
                } else if (ts.isArrayLiteralExpression(child.initializer)) {
                    if (key === 'action') {
                        def.action = child.initializer.elements.map(
                            (element) => {
                                if (ts.isStringLiteral(element)) {
                                    return element.text;
                                }
                                return '';
                            }
                        );
                    }
                }
            }
        });

        return [def];
    }

    return [];
}

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

export const getDefaultExport = (): TriggerDef[] => {
    if (!triggerProgram) {
        console.error('Trigger program not initialized');
        return [];
    }

    const sourceFile = triggerProgram.getSourceFile(
        join(pathConfig.triggerHome, 'index.ts')
    );
    if (!sourceFile) {
        console.error('Source file not found');
        return [];
    }

    const typeChecker = triggerProgram.getTypeChecker();
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
            triggerProgram
        );
    }

    console.error('Unable to resolve default export');
    return [];
};
