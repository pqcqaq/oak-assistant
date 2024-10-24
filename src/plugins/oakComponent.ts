import { join } from 'path';
import * as vscode from 'vscode';
import fs from 'fs';
import { getOakComponentData } from '../utils/components';
import { EntityComponentDef } from '../types';
import * as ts from 'typescript';
import {
    addAttrToFormData,
    addMethodToMethods,
    getWebComponentPropsData,
} from '../utils/ts-utils';

// 创建诊断集合
const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('oakComponentProps');

class OakComponentPropsLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        // 获取组件信息
        const componentInfo = getComponentInfo(document);
        if (!componentInfo) {
            return [];
        }

        const plainText = document.getText();
        const sourceFile = ts.createSourceFile(
            'temp.ts',
            plainText,
            ts.ScriptTarget.Latest,
            true
        );
        const node = getWebComponentPropsData(sourceFile);
        if (!node) {
            return [];
        }

        const documentLinks: vscode.DocumentLink[] = [];
        const diagnostics: vscode.Diagnostic[] = [];
        // 检查entity名称是否相同
        if (node.entityName.value !== componentInfo.entityName) {
            if (!componentInfo.entityName) {
                // 是一个虚拟节点，显示info
                const startPos = document.positionAt(node.entityName.pos.start);
                const endPos = document.positionAt(node.entityName.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `提示：当前组件为Virtual虚拟节点`,
                    vscode.DiagnosticSeverity.Information
                );
                diagnostic.code = 'virtual_entity';
                diagnostics.push(diagnostic);
            } else {
                // 进行错误提示
                const startPos = document.positionAt(node.entityName.pos.start);
                const endPos = document.positionAt(node.entityName.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `组件Entity与index.tx定义不一致`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'invalid_entity';
                // 详细信息, 提示index.ts中的信息, 这里没有position
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(
                            document.uri,
                            new vscode.Range(0, 0, 0, 0)
                        ),
                        'index.ts中定义的Entity为：' + componentInfo.entityName
                    ),
                ];
                diagnostics.push(diagnostic);
            }
        } else {
            // 添加documentLink,跳转到index.ts
            const startPos = document.positionAt(node.entityName.pos.start);
            const endPos = document.positionAt(node.entityName.pos.end);
            const range = new vscode.Range(startPos, endPos);
            const uri = vscode.Uri.file(
                join(document.uri.fsPath, '../index.ts')
            );
            const link = new vscode.DocumentLink(range, uri);
            link.tooltip = '跳转到index.ts';
            documentLinks.push(link);
        }

        // 检查isList是否相同
        if (node.isList.value !== componentInfo.isList) {
            // 进行错误提示
            const startPos = document.positionAt(node.isList.pos.start);
            const endPos = document.positionAt(node.isList.pos.end);
            const range = new vscode.Range(startPos, endPos);
            const diagnostic = new vscode.Diagnostic(
                range,
                `组件isList与index.tx定义不一致`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.code = 'invalid_isList';
            // 详细信息, 提示index.ts中的信息, 这里没有position
            diagnostic.relatedInformation = [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(
                        document.uri,
                        new vscode.Range(0, 0, 0, 0)
                    ),
                    'index.ts中定义的isList为：' + componentInfo.isList
                ),
            ];
            diagnostics.push(diagnostic);
        } else {
            // 添加documentLink,跳转到index.ts
            const startPos = document.positionAt(node.isList.pos.start);
            const endPos = document.positionAt(node.isList.pos.end);
            const range = new vscode.Range(startPos, endPos);
            const uri = vscode.Uri.file(
                join(document.uri.fsPath, '../index.ts')
            );
            const link = new vscode.DocumentLink(range, uri);
            link.tooltip = '跳转到index.ts';
            documentLinks.push(link);
        }

        // 检查attrs是否都在定义中
        node.attrList?.forEach((attr) => {
            if (
                !componentInfo.formDataAttrs
                    ?.map((i) => i.value)
                    .includes(attr.value as string)
            ) {
                // 这里还需要判断在不在propertiesAttrs里面
                if (
                    componentInfo.propertiesAttrs
                        ?.map((i) => i.value)
                        .includes(attr.value as string)
                ) {
                    // 创建文档链接
                    const startPos = document.positionAt(attr.pos.start);
                    const endPos = document.positionAt(attr.pos.end);
                    const range = new vscode.Range(startPos, endPos);
                    const toStart = componentInfo.propertiesAttrs?.find(
                        (i) => i.value === attr.value
                    )?.pos.start;
                    const toEnd = componentInfo.propertiesAttrs?.find(
                        (i) => i.value === attr.value
                    )?.pos.end;
                    const args = {
                        filePath: join(document.uri.fsPath, '../index.ts'),
                        start: toStart,
                        end: toEnd,
                    };
                    const link = new vscode.DocumentLink(
                        range,
                        vscode.Uri.parse(
                            `command:oak-assistant.jumpToPosition?${encodeURIComponent(
                                JSON.stringify(args)
                            )}`
                        )
                    );
                    link.tooltip = 'index.ts中的properties之一';
                    documentLinks.push(link);
                    return;
                } else {
                    // 再判断在不在data里面
                    if (
                        componentInfo.datas
                            ?.map((i) => i.value)
                            .includes(attr.value as string)
                    ) {
                        // 创建文档链接
                        const startPos = document.positionAt(attr.pos.start);
                        const endPos = document.positionAt(attr.pos.end);
                        const range = new vscode.Range(startPos, endPos);
                        const toStart = componentInfo.datas?.find(
                            (i) => i.value === attr.value
                        )?.pos.start;
                        const toEnd = componentInfo.datas?.find(
                            (i) => i.value === attr.value
                        )?.pos.end;
                        const args = {
                            filePath: join(document.uri.fsPath, '../index.ts'),
                            start: toStart,
                            end: toEnd,
                        };
                        const link = new vscode.DocumentLink(
                            range,
                            vscode.Uri.parse(
                                `command:oak-assistant.jumpToPosition?${encodeURIComponent(
                                    JSON.stringify(args)
                                )}`
                            )
                        );
                        link.tooltip = 'index.ts中的data之一';
                        documentLinks.push(link);
                        return;
                    }
                }
                const startPos = document.positionAt(attr.pos.start);
                const endPos = document.positionAt(attr.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `属性${attr.value}未在index.ts中定义`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'invalid_attr';
                // 添加元数据
                diagnostic.source = attr.value as string;
                diagnostics.push(diagnostic);
            } else {
                // 添加文档链接
                const startPos = document.positionAt(attr.pos.start);
                const endPos = document.positionAt(attr.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const toStart = componentInfo.formDataAttrs?.find(
                    (i) => i.value === attr.value
                )?.pos.start;
                const toEnd = componentInfo.formDataAttrs?.find(
                    (i) => i.value === attr.value
                )?.pos.end;
                const args = {
                    filePath: join(document.uri.fsPath, '../index.ts'),
                    start: toStart,
                    end: toEnd,
                };
                const link = new vscode.DocumentLink(
                    range,
                    vscode.Uri.parse(
                        `command:oak-assistant.jumpToPosition?${encodeURIComponent(
                            JSON.stringify(args)
                        )}`
                    )
                );
                link.tooltip = 'index.ts中formData的返回值之一';
                documentLinks.push(link);
            }
        });

        // 检查methods是否都在定义中
        node.methodList?.forEach((method) => {
            if (
                !componentInfo.methodNames
                    ?.map((i) => i.value)
                    .includes(method.value as string)
            ) {
                const startPos = document.positionAt(method.pos.start);
                const endPos = document.positionAt(method.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `方法${method.value}未在index.ts中定义`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'invalid_method';
                // 添加元数据
                diagnostic.source = method.value as string;
                diagnostics.push(diagnostic);
            } else {
                // 添加文档链接
                const startPos = document.positionAt(method.pos.start);
                const endPos = document.positionAt(method.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const toStart = componentInfo.methodNames?.find(
                    (i) => i.value === method.value
                )?.pos.start;
                const toEnd = componentInfo.methodNames?.find(
                    (i) => i.value === method.value
                )?.pos.end;
                const args = {
                    filePath: join(document.uri.fsPath, '../index.ts'),
                    start: toStart,
                    end: toEnd,
                };
                const link = new vscode.DocumentLink(
                    range,
                    vscode.Uri.parse(
                        `command:oak-assistant.jumpToPosition?${encodeURIComponent(
                            JSON.stringify(args)
                        )}`
                    )
                );
                link.tooltip = 'index.ts中methods的方法之一';
                documentLinks.push(link);
            }
        });

        diagnosticCollection.set(document.uri, diagnostics);
        return documentLinks;
    }
}

function getComponentInfo(
    document: vscode.TextDocument
): EntityComponentDef | undefined {
    // 换成更简单的实现方式
    const docPath = document.uri.fsPath;
    const indexPath = join(docPath, '../');

    if (!fs.existsSync(indexPath)) {
        return;
    }
    const data = getOakComponentData(indexPath);
    if (!data) {
        return;
    }

    return data;
}

class OakComponentPropsCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        const diagnostics = context.diagnostics;
        const codeActions: vscode.CodeAction[] = [];

        for (const diagnostic of diagnostics) {
            if (diagnostic.code === 'invalid_entity') {
                const componentInfo = getComponentInfo(document);
                const fix = new vscode.CodeAction(
                    '修复 Entity 名称',
                    vscode.CodeActionKind.QuickFix
                );
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.replace(
                    document.uri,
                    diagnostic.range,
                    `'${componentInfo!.entityName}'`
                );
                fix.isPreferred = true;
                codeActions.push(fix);
            } else if (diagnostic.code === 'invalid_isList') {
                const componentInfo = getComponentInfo(document);
                const fix = new vscode.CodeAction(
                    '修复 isList 值',
                    vscode.CodeActionKind.QuickFix
                );
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.replace(
                    document.uri,
                    diagnostic.range,
                    componentInfo!.isList.toString()
                );
                fix.isPreferred = true;
                codeActions.push(fix);
            } else if (diagnostic.code === 'invalid_attr') {
                const fix = new vscode.CodeAction(
                    '在 index.ts 中添加属性',
                    vscode.CodeActionKind.QuickFix
                );
                fix.command = {
                    title: '添加属性到 formData',
                    command: 'oakComponent.addAttrToFormData',
                    arguments: [document.uri, diagnostic.source],
                };
                codeActions.push(fix);
            } else if (diagnostic.code === 'invalid_method') {
                const fix = new vscode.CodeAction(
                    '在 index.ts 中添加方法',
                    vscode.CodeActionKind.QuickFix
                );
                fix.command = {
                    title: '添加方法到 methods',
                    command: 'oakComponent.addMethodToMethods',
                    arguments: [document.uri, diagnostic.source],
                };
                codeActions.push(fix);
            }
        }

        return codeActions;
    }
}

const fixAttrProvider = vscode.commands.registerCommand(
    'oakComponent.addAttrToFormData',
    addAttrToFormData
);
const fixMethodProvider = vscode.commands.registerCommand(
    'oakComponent.addMethodToMethods',
    addMethodToMethods
);

const documentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new OakComponentPropsLinkProvider()
);

const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new OakComponentPropsCodeActionProvider()
);

// 当工作区有任何文件保存的时候，重新

export function activateOakComponentPropsLinkProvider(
    context: vscode.ExtensionContext
) {
    context.subscriptions.push(documentLinkProvider);
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(codeActionProvider);
    context.subscriptions.push(fixAttrProvider);
    context.subscriptions.push(fixMethodProvider);
    // context.subscriptions.push(completionProvider);
}

export function deactivateOakComponentPropsLinkProvider() {
    documentLinkProvider.dispose();
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
    codeActionProvider.dispose();
    fixAttrProvider.dispose();
    fixMethodProvider.dispose();
    // completionProvider.dispose();
}

// 代码提示
// const completionProvider = vscode.languages.registerCompletionItemProvider(
//     { scheme: 'file', language: 'typescriptreact' },
//     {
//         provideCompletionItems(document, position, token, context) {
//             // 获取当前文档的组件信息
//             const componentInfo = getComponentInfo(document);
//             if (!componentInfo) {
//                 return [];
//             }

//             // 获取当前光标所在行
//             const line = document.lineAt(position.line);
//             const lineText = line.text;

//             // 判断是否在 WebComponentProps 类型定义内
//             const match = lineText.match(
//                 /WebComponentProps<[\n\s+]*EntityDict,[\n\s]+['"](\S+)['"],[\n\s]+(true|false)(,([\n\s]*\{([\n\s]+([a-zA-Z0-9_$]*[:?])[\S\s^}]*?;)*[\n\s]*\}(,|\n|)){0,2}[\n\s]*)?>/
//             );
//             if (!match) {
//                 return [];
//             }

//             // 获取当前光标前的文本
//             const prefix = lineText.substring(0, position.character);

//             // 获取当前光标后的文本
//             const suffix = lineText.substring(position.character);

//             // 判断是否在 attrs 或 methods 定义内
//             if (prefix.endsWith('{') && suffix.startsWith('}')) {
//                 const completionItems: vscode.CompletionItem[] = [];

//                 // 获取 attrs 和 methods 的信息
//                 const formDataAttrs = componentInfo.formDataAttrs || [];
//                 const propertiesAttrs = componentInfo.propertiesAttrs || [];
//                 const methodNames = componentInfo.methodNames || [];

//                 // 添加 attrs 的代码提示
//                 formDataAttrs.forEach((attr) => {
//                     const completionItem = new vscode.CompletionItem(attr);
//                     completionItem.kind = vscode.CompletionItemKind.Field;
//                     completionItem.detail = 'formData 属性';
//                     completionItems.push(completionItem);
//                 });

//                 // 添加 properties 的代码提示
//                 propertiesAttrs.forEach((attr) => {
//                     const completionItem = new vscode.CompletionItem(attr);
//                     completionItem.kind = vscode.CompletionItemKind.Field;
//                     completionItem.detail = 'properties 属性';
//                     completionItems.push(completionItem);
//                 });

//                 // 添加 methods 的代码提示
//                 methodNames.forEach((method) => {
//                     const completionItem = new vscode.CompletionItem(method);
//                     completionItem.kind = vscode.CompletionItemKind.Method;
//                     completionItem.detail = 'methods 方法';
//                     completionItems.push(completionItem);
//                 });

//                 return completionItems;
//             }

//             return [];
//         },
//     },
//     // 触发代码提示的字符
//     ' ',
//     ',',
//     ':',
//     ';',
//     '}',
//     '(',
//     ')',
//     '\n'
// );
