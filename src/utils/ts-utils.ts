import ts from 'typescript';
import { DocumentValue, RenderProps } from '../types';
import * as vscode from 'vscode';
import { join } from 'path';

/**
 *  获取函数的返回值的attrs
 * @param element   函数体节点
 * @returns       返回值的attrs
 */
export const getAttrsFromFormData = (
    element: ts.ObjectLiteralElementLike
): string[] => {
    const attrs: string[] = [];
    element.getChildren().forEach((child) => {
        if (ts.isBlock(child)) {
            // 拿到block的returnStatement
            let returnStatement: ts.ReturnStatement | null = null;
            ts.forEachChild(child, (grandChild) => {
                if (ts.isReturnStatement(grandChild)) {
                    // 处理 return 语句
                    returnStatement = grandChild;
                }
            });
            if (!returnStatement) {
                return;
            }
            ts.forEachChild(returnStatement, (returnChild) => {
                if (ts.isObjectLiteralExpression(returnChild)) {
                    ts.forEachChild(returnChild, (objectChild) => {
                        if (ts.isShorthandPropertyAssignment(objectChild)) {
                            attrs.push(objectChild.name.getText());
                        }
                        if (ts.isPropertyAssignment(objectChild)) {
                            attrs.push(objectChild.name.getText());
                        }
                        if (ts.isSpreadAssignment(objectChild)) {
                            // 这里是展开运算符
                            if (ts.isSpreadAssignment(objectChild)) {
                                // 处理展开运算符
                                if (
                                    ts.isObjectLiteralExpression(
                                        objectChild.expression
                                    )
                                ) {
                                    // 如果展开的是一个对象字面量表达式
                                    objectChild.expression.properties.forEach(
                                        (prop) => {
                                            if (
                                                ts.isPropertyAssignment(prop) ||
                                                ts.isShorthandPropertyAssignment(
                                                    prop
                                                )
                                            ) {
                                                attrs.push(prop.name.getText());
                                            }
                                        }
                                    );
                                } else if (
                                    ts.isIdentifier(objectChild.expression)
                                ) {
                                    // 如果展开的是一个标识符，我们可能需要查找它的定义
                                    console.error(
                                        'Spread assignment with identifier:',
                                        objectChild.expression.text
                                    );
                                } else {
                                    // 处理其他可能的情况
                                    console.error(
                                        'Spread assignment with expression type:',
                                        objectChild.expression.kind
                                    );
                                }
                            }
                        }
                    });
                }
            });
        }
    });
    return attrs;
};

/**
 *  获取函数的返回值的attrs
 * @param element  函数体节点
 * @returns    返回值的attrs
 */
export const getAttrsFromMethods = (
    element: ts.ObjectLiteralElementLike
): string[] => {
    const attrs: string[] = [];
    ts.forEachChild(element, (child) => {
        if (ts.isObjectLiteralExpression(child)) {
            ts.forEachChild(child, (objectChild) => {
                if (ts.isMethodDeclaration(objectChild)) {
                    attrs.push(objectChild.name.getText());
                }
            });
        }
    });
    return attrs;
};

/**
 *  获取函数的返回值的attrs
 * @param sourceFile    源文件
 * @returns  返回值的attrs
 *
 * 这里实际上有四种情况：
 *
 * export default function render
 * function render....export default render;
 * const render....export default render;
 * export default [ArrowFunction]
 *
 * 所以最开始先考虑四种情况，拿到functionNode，然后再去拿到第一个参数
 */
export const getWebComponentPropsData = (
    sourceFile: ts.SourceFile
): RenderProps | undefined => {
    let functionNode: ts.FunctionDeclaration | ts.ArrowFunction | undefined;

    // 遍历 AST 找到目标函数节点
    ts.forEachChild(sourceFile, (node) => {
        if (
            ts.isFunctionDeclaration(node) &&
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
            // Case 1: export default function render(...)
            functionNode = node;
        } else if (ts.isFunctionDeclaration(node)) {
            // Case 2: function render(...) export default render;
            functionNode = node;
        } else if (ts.isVariableStatement(node)) {
            // Case 3: const render = (...) => {...} export default render;
            const declaration = node.declarationList.declarations[0];
            if (
                ts.isVariableDeclaration(declaration) &&
                ts.isArrowFunction(declaration.initializer!)
            ) {
                functionNode = declaration.initializer;
            }
        } else if (
            ts.isExportAssignment(node) &&
            ts.isArrowFunction(node.expression)
        ) {
            // Case 4: export default (...) => {...}
            functionNode = node.expression;
        }
    });

    if (!functionNode || !functionNode.parameters.length) {
        return undefined;
    }

    const firstParam = functionNode.parameters[0];
    if (firstParam.type && ts.isTypeReferenceNode(firstParam.type)) {
        // 如果名称不为WebComponentProps
        if (firstParam.type.typeName.getText() !== 'WebComponentProps') {
            return undefined;
        }

        const args = firstParam.type.typeArguments;
        // dictName: TypeReference -> Identifier
        // entityName: LiteralType -> StringLiteral
        // isList: LiteralType -> TrueKeyword | FalseKeyword
        // attrList: TypeLiteral -> PropertySignature
        // methodList: TypeLiteral -> PropertySignature

        if (!ts.isTypeReferenceNode(args![0])) {
            console.log('');

            return undefined;
        }

        const dictNameNode = args![0].typeName;
        const dictName: DocumentValue = {
            value: dictNameNode.getText(),
            pos: {
                start: dictNameNode.getStart(),
                end: dictNameNode.getEnd(),
            },
        };

        if (!ts.isLiteralTypeNode(args![1])) {
            return undefined;
        }

        const nameRawTextNode = args![1].literal;
        const nameRawText = args![1].literal.getText();
        const entityName: DocumentValue = {
            value: nameRawText.substring(1, nameRawText.length - 1),
            pos: {
                start: nameRawTextNode.getStart(),
                end: nameRawTextNode.getEnd(),
            },
        };

        if (!ts.isLiteralTypeNode(args![2])) {
            return undefined;
        }

        const isListNode = args![2].literal;
        const isList: DocumentValue = {
            value: isListNode.getText() === 'true' ? true : false,
            pos: {
                start: isListNode.getStart(),
                end: isListNode.getEnd(),
            },
        };

        const data: RenderProps = {
            dictName,
            entityName,
            isList,
        };

        // 前面三个是必须的，后面两个是可选的
        if (args![3] && ts.isTypeLiteralNode(args![3])) {
            const attrList: DocumentValue[] = [];
            args![3].members.forEach((member) => {
                if (ts.isPropertySignature(member)) {
                    attrList.push({
                        value: member.name.getText(),
                        pos: {
                            start: member.name.getStart(),
                            end: member.name.getEnd(),
                        },
                    });
                }
            });
            data.attrList = attrList;
        }

        if (args![4] && ts.isTypeLiteralNode(args![4])) {
            const methodList: DocumentValue[] = [];
            args![4].members.forEach((member) => {
                if (ts.isPropertySignature(member)) {
                    methodList.push({
                        value: member.name.getText(),
                        pos: {
                            start: member.name.getStart(),
                            end: member.name.getEnd(),
                        },
                    });
                }
            });
            data.methodList = methodList;
        }

        return data;
    }

    return undefined;
};

export async function addAttrToFormData(
    documentUri: vscode.Uri,
    attrName: string
) {
    // const attrName = message.match(/属性(\w+)未在index.ts中定义/)?.[1];
    if (!attrName) {
        vscode.window.showErrorMessage('无法识别属性名');
        return;
    }

    const indexPath = vscode.Uri.file(join(documentUri.fsPath, '../index.ts'));
    const indexDocument = await vscode.workspace.openTextDocument(indexPath);
    const indexText = indexDocument.getText();

    const sourceFile = ts.createSourceFile(
        'index.ts',
        indexText,
        ts.ScriptTarget.Latest,
        true
    );

    let formDataPos: number | null = null;
    let insertPos: number | null = null;

    function visitNode(node: ts.Node) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'OakComponent'
        ) {
            const arg = node.arguments[0];
            if (ts.isObjectLiteralExpression(arg)) {
                const formData = arg.properties.find(
                    (prop): prop is ts.MethodDeclaration =>
                        ts.isMethodDeclaration(prop) &&
                        ts.isIdentifier(prop.name) &&
                        prop.name.text === 'formData'
                );

                if (formData) {
                    const returnStatement = formData.body?.statements.find(
                        ts.isReturnStatement
                    );
                    if (
                        returnStatement &&
                        ts.isObjectLiteralExpression(
                            returnStatement.expression!
                        )
                    ) {
                        formDataPos = formData.pos;
                        insertPos = returnStatement.expression.properties.end;
                    }
                }
            }
        }

        ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);

    if (formDataPos !== null && insertPos !== null) {
        const edit = new vscode.WorkspaceEdit();

        // 获取插入位置的前一个字符
        const prevChar = indexDocument.getText(
            new vscode.Range(
                indexDocument.positionAt(insertPos - 1),
                indexDocument.positionAt(insertPos)
            )
        );

        // 根据前一个字符是否为逗号来决定插入的文本
        let insertText;
        if (prevChar.trim() === ',') {
            insertText = `\n            ${attrName}: this.props.${attrName}`;
        } else {
            insertText = `,\n            ${attrName}: this.props.${attrName}`;
        }

        edit.insert(indexPath, indexDocument.positionAt(insertPos), insertText);
        await vscode.workspace.applyEdit(edit);
        // vscode.window.showInformationMessage(`属性 ${attrName} 已添加到 formData`);
    } else {
        vscode.window.showErrorMessage('无法在 index.ts 中找到合适的插入位置');
    }
}

export async function addMethodToMethods(
    documentUri: vscode.Uri,
    methodName: string
) {
    if (!methodName) {
        vscode.window.showErrorMessage('无法识别方法名');
        return;
    }

    const indexPath = vscode.Uri.file(join(documentUri.fsPath, '../index.ts'));
    const indexDocument = await vscode.workspace.openTextDocument(indexPath);
    const indexText = indexDocument.getText();

    const sourceFile = ts.createSourceFile(
        'index.ts',
        indexText,
        ts.ScriptTarget.Latest,
        true
    );

    let methodsPos: number | null = null;
    let insertPos: number | null = null;

    function visitNode(node: ts.Node) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'OakComponent'
        ) {
            const arg = node.arguments[0];
            if (ts.isObjectLiteralExpression(arg)) {
                const methods = arg.properties.find(
                    (prop): prop is ts.PropertyAssignment =>
                        ts.isPropertyAssignment(prop) &&
                        ts.isIdentifier(prop.name) &&
                        prop.name.text === 'methods'
                );

                if (
                    methods &&
                    ts.isObjectLiteralExpression(methods.initializer)
                ) {
                    methodsPos = methods.pos;
                    insertPos = methods.initializer.properties.end;
                }
            }
        }

        ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);

    if (methodsPos !== null && insertPos !== null) {
        const edit = new vscode.WorkspaceEdit();

        // 获取插入位置的前一个字符
        const prevChar = indexDocument.getText(
            new vscode.Range(
                indexDocument.positionAt(insertPos - 1),
                indexDocument.positionAt(insertPos)
            )
        );

        // 根据前一个字符是否为逗号来决定插入的文本
        let insertText;
        if (prevChar.trim() === ',') {
            insertText = `\n        ${methodName}() {},`;
        } else {
            insertText = `,\n        ${methodName}() {},`;
        }

        edit.insert(indexPath, indexDocument.positionAt(insertPos), insertText);
        await vscode.workspace.applyEdit(edit);
        // vscode.window.showInformationMessage(
        //     `方法 ${methodName} 已添加到 methods`
        // );
    } else {
        vscode.window.showErrorMessage('无法在 index.ts 中找到合适的插入位置');
    }
}