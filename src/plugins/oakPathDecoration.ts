import * as vscode from 'vscode';
import { getProjectionList, subscribe } from '../utils/entities';
import { join } from 'path';
import fs from 'fs';
import { getOakComponentData } from '../utils/components';
import { onEntityLoaded } from '../utils/status';

let entityName: string | undefined;
let entityProjections: string[] = [];

const oakPathRegex = /`\$\{oakFullpath\}.(\w+\$?\w+?)`/g;

// 创建诊断集合
const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('oakPath');

function updateDiagnostics(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    const fileText = document.getText();
    let match: RegExpExecArray | null;

    while ((match = oakPathRegex.exec(fileText)) !== null) {

        if (!entityName) {
            // 提示在非oakComponent中使用oakPath，无法检测
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + 16);
            const range = new vscode.Range(startPos, endPos);
            const diagnostic = new vscode.Diagnostic(
                range,
                `上下文非OakComponent，无法检测`,
                vscode.DiagnosticSeverity.Information
            );
            diagnostic.code = 'invalid_oak_path';
            diagnostics.push(diagnostic);
            continue;
        }

        const projection = match[1];

        if (!entityProjections.includes(projection)) {
            const startPos = document.positionAt(match.index + 16);
            const endPos = document.positionAt(
                match.index + 16 + projection.length
            );
            const range = new vscode.Range(startPos, endPos);

            const diagnostic = new vscode.Diagnostic(
                range,
                `实体类：${entityName} 中不存在属性：${projection}`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.code = 'invalid_oak_path';
            diagnostics.push(diagnostic);
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

function parseDocument(document: vscode.TextDocument) {
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

    entityName = data.entityName;
    entityProjections = getProjectionList(entityName);
}

function activateDiagnostics(document: vscode.TextDocument) {
    parseDocument(document);
    updateDiagnostics(document);
}

console.log('oakPathHighlighter enabled');

let activeDocument: vscode.TextDocument | undefined = undefined;

// 订阅entity更新
subscribe(() => {
    if (activeDocument) {
        activateDiagnostics(activeDocument);
    }
});

onEntityLoaded(() => {
    // 加载完成先激活一次
    if (vscode.window.activeTextEditor) {
        activeDocument = vscode.window.activeTextEditor.document;
        activateDiagnostics(activeDocument);
    }
});

export default [
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            activeDocument = editor.document;
            // 清空之前的缓存
            entityName = undefined;
            entityProjections = [];
            activateDiagnostics(activeDocument);
        }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
        if (activeDocument && event.document === activeDocument) {
            updateDiagnostics(activeDocument);
        }
    }),
];
