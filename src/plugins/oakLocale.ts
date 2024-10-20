import { join } from 'path';
import { getLocalesData, isKeyExist } from '../utils/locales';
import * as vscode from 'vscode';

// 创建诊断集合
const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('oakLocales');

const oakLocalesProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescriptreact' },
    {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
        ) {
            const lineText = document.lineAt(position).text;
            const linePrefix = lineText.substring(0, position.character);

            if (!linePrefix.includes('t(')) {
                return undefined;
            }

            if (linePrefix.includes(')')) {
                return undefined;
            }

            // 修改正则表达式以匹配更多情况
            const regex = /t\(['"]([^'"]*)/;
            const match = linePrefix.match(regex);

            if (!match) {
                console.log('No match found'); // 添加日志
                return undefined;
            }

            console.log('Match found:', match[1]); // 添加日志

            const filePath = document.uri.fsPath;
            const prefix = match[1] || '';

            const localeItems = getLocalesData(
                join(filePath, '../locales'),
                prefix
            );

            return localeItems.map((item) => {
                const completionItem = new vscode.CompletionItem(
                    item.label,
                    vscode.CompletionItemKind.Text
                );
                completionItem.detail = item.desc;
                completionItem.insertText = item.value;
                return completionItem;
            });
        },
    },
    "'",
    '"',
    '('
);

// 添加文档变化监听器
const documentChangeListener = vscode.workspace.onDidChangeTextDocument(
    (event) => {
        if (event.document.languageId === 'typescriptreact') {
            validateDocument(event.document);
        }
    }
);

// 添加文档打开监听器
const documentOpenListener = vscode.workspace.onDidOpenTextDocument(
    (document) => {
        if (document.languageId === 'typescriptreact') {
            validateDocument(document);
        }
    }
);

function validateDocument(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const tCallRegex = /t$['"](.*?)['"]$/g;
    let match;

    while ((match = tCallRegex.exec(text)) !== null) {
        const key = match[1];
        if (!isKeyExist(key)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const diagnostic = new vscode.Diagnostic(
                range,
                `找不到对应的locale定义: ${key}`,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

export function activateOakLocale(context: vscode.ExtensionContext) {
    context.subscriptions.push(oakLocalesProvider);
    context.subscriptions.push(documentChangeListener);
    context.subscriptions.push(documentOpenListener);
    context.subscriptions.push(diagnosticCollection);
    console.log('oakLocale插件已激活');
}

export function deactivateOakLocale() {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
}
