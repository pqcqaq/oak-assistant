import { join } from 'path';
import * as vscode from 'vscode';
import fs from 'fs';
import { getOakComponentData } from '../utils/components';
import { EntityComponentDef, RenderProps } from '../types';
import * as ts from 'typescript';
import { getWebComponentPropsData } from '../utils/ts-utils';

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
        }

        // 检查attrs是否都在定义中
        node.attrList?.forEach((attr) => {
            if (!componentInfo.formDataAttrs?.includes(attr.value as string)) {
                const startPos = document.positionAt(attr.pos.start);
                const endPos = document.positionAt(attr.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `属性${attr.value}未在index.ts中定义`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'invalid_attr';
                diagnostics.push(diagnostic);
            }
        });

        // 检查methods是否都在定义中
        node.methodList?.forEach((method) => {
            if (!componentInfo.methodNames?.includes(method.value as string)) {
                const startPos = document.positionAt(method.pos.start);
                const endPos = document.positionAt(method.pos.end);
                const range = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `方法${method.value}未在index.ts中定义`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'invalid_method';
                diagnostics.push(diagnostic);
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
            }
        }

        return codeActions;
    }
}

const documentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new OakComponentPropsLinkProvider()
);

const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new OakComponentPropsCodeActionProvider()
);

export function activateOakComponentPropsLinkProvider(
    context: vscode.ExtensionContext
) {
    context.subscriptions.push(documentLinkProvider);
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(codeActionProvider);
}

export function deactivateOakComponentPropsLinkProvider() {
    documentLinkProvider.dispose();
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
    codeActionProvider.dispose();
}
