import { join } from 'path';
import {
    getCachedLocaleItemByKey,
    getLocalesData,
    isKeyExist,
} from '../utils/locales';
import * as vscode from 'vscode';
import { isLoadingLocale, waitUntilLocaleLoaded } from '../utils/status';
import fs from 'fs';

// 创建诊断集合
const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('oakLocales');

class LocaleDocumentLinkProvider implements vscode.DocumentLinkProvider {
    async provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentLink[]> {
        const text = document.getText();
        const tCallRegex = /t\(['"`]([^'"`]*)['"`]\)/g;
        const documentLinks: vscode.DocumentLink[] = [];
        let match;

        if (isLoadingLocale()) {
            await waitUntilLocaleLoaded();
        }

        while ((match = tCallRegex.exec(text)) !== null) {
            const key = match[1];
            if (isKeyExist(key)) {
                const localePath = getCachedLocaleItemByKey(key);
                if (localePath && localePath.path) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(
                        match.index + match[0].length
                    );
                    const range = new vscode.Range(startPos, endPos);

                    let filePath = join(localePath.path, 'zh_CN.json');
                    if (!fs.existsSync(filePath)) {
                        filePath = join(localePath.path, 'zh-CN.json');
                    }

                    const documentLink = new vscode.DocumentLink(
                        range,
                        vscode.Uri.file(filePath)
                    );
                    documentLink.tooltip = '点击跳转到定义';
                    documentLinks.push(documentLink);
                }
            }
        }

        return documentLinks;
    }
}

const documentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new LocaleDocumentLinkProvider()
);

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
            const regex = /t\(['"`]([^'"`]*)/;
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
    '(',
    '`'
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

// 在切换窗口的时候调用一次getLocalesData
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
        const document = editor.document;
        if (document.languageId === 'typescriptreact') {
            getLocalesData(join(document.uri.fsPath, '../locales'));
            validateDocument(document);
        }
    }
});

async function validateDocument(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    // 修改正则表达式以正确匹配 t 函数调用
    const tCallRegex = /t\(['"`]([^'"`]*)['"`]\)/g;
    let match;

    if (isLoadingLocale()) {
        await waitUntilLocaleLoaded();
    }

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
            // 添加 code 用于区分错误类型
            diagnostic.code = 'missing_locale';
            diagnostics.push(diagnostic);
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

const addLocaleActionProvider = vscode.languages.registerCodeActionsProvider(
    'typescriptreact',
    {
        provideCodeActions(document, range, context, token) {
            const diagnostics = context.diagnostics;
            const codeActions: vscode.CodeAction[] = [];

            for (const diagnostic of diagnostics) {
                if (diagnostic.code === 'missing_locale') {
                    const action = new vscode.CodeAction(
                        '添加 locale 定义',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.command = {
                        title: 'Add locale definition',
                        command: 'oak-i18n.addLocaleDefinition',
                        arguments: [
                            document,
                            diagnostic.range,
                            diagnostic.message.split(': ')[1],
                        ],
                    };
                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;
                    codeActions.push(action);
                }
            }
            return codeActions;
        },
    }
);

const addLocaleCommand = vscode.commands.registerCommand(
    'oak-i18n.addLocaleDefinition',
    (document: vscode.TextDocument, range: vscode.Range, key: string) => {
        // 得到文档的位置
        const filePath = document.uri.fsPath;
        // 得到 locale 文件的路径
        // 如果不存在 locales目录，需要创建
        const localeDir = join(filePath, '../locales');
        if (!fs.existsSync(localeDir)) {
            fs.mkdirSync(localeDir);
        }
        // 判断是否存在 zh_CN.json 文件，如果不存在则使用 zh-CN.json
        let localeFilePath = join(filePath, '../locales/zh-CN.json');
        if (!fs.existsSync(localeFilePath)) {
            localeFilePath = join(filePath, '../locales/zh_CN.json');
            if (!fs.existsSync(localeFilePath)) {
                // 如果两个都不存在，创建一个新的 zh_CN.json 文件
                fs.writeFileSync(localeFilePath, '{}');
            }
        }
        // 尝试读取文件
        let localeData = {};
        try {
            localeData = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
        } catch (error) {
            // 如果读取文件失败，直接返回
            vscode.window.showErrorMessage('读取 locale 文件失败');
            return;
        }
        // 添加新的键值对
        addLocaleToData(localeData, key);
        // 写入文件
        fs.writeFileSync(localeFilePath, JSON.stringify(localeData, null, 2));
        // 跳转到文件
        vscode.window.showTextDocument(vscode.Uri.file(localeFilePath));
        // 更新缓存
        getLocalesData(localeDir, '', true);
    }
);

const addLocaleToData = (
    localeData: any,
    key: string,
    value: string = ''
): void => {
    const keys = key.split('.');
    let current = localeData;

    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];

        if (i === keys.length - 1) {
            // 最后一个键，直接赋值
            current[k] = value;
        } else {
            // 不是最后一个键，检查下一级
            if (!(k in current)) {
                // 如果键不存在，创建一个新的对象
                current[k] = {};
            } else if (typeof current[k] !== 'object') {
                // 如果存在但不是对象，抛出错误
                throw new Error(
                    `Cannot add key "${key}". "${k}" is not an object.`
                );
            }
            // 移动到下一级
            current = current[k];
        }
    }
};

export function activateOakLocale(context: vscode.ExtensionContext) {
    context.subscriptions.push(oakLocalesProvider);
    context.subscriptions.push(documentChangeListener);
    context.subscriptions.push(documentOpenListener);
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(documentLinkProvider);
    context.subscriptions.push(addLocaleActionProvider);
    context.subscriptions.push(addLocaleCommand);
    console.log('oakLocale插件已激活');
}

export function deactivateOakLocale() {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
    documentChangeListener.dispose();
    documentOpenListener.dispose();
    documentLinkProvider.dispose();
    addLocaleActionProvider.dispose();
    addLocaleCommand.dispose();
}
