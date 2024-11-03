import {
    addKeyToLocale,
    addLocaleToData,
    getLocaleItem,
} from './../utils/locales';
import { join } from 'path';
import { getCachedLocaleItemByKey, getLocalesData } from '../utils/locales';
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
        const tCallRegex = /(?<![a-zA-Z])t\(['"`]([^'"`]*)['"`]\)/g;
        const documentLinks: vscode.DocumentLink[] = [];
        const diagnostics: vscode.Diagnostic[] = [];
        let match;

        if (isLoadingLocale()) {
            await waitUntilLocaleLoaded();
        }

        getLocalesData(join(document.uri.fsPath, '../locales'));
        while ((match = tCallRegex.exec(text)) !== null) {
            const key = match[1];

            if (key.includes('${')) {
                continue;
            }

            const item = getLocaleItem(key);
            if (item) {
                const localePath = getCachedLocaleItemByKey(key);
                if (localePath && localePath.path) {
                    const startPos = document.positionAt(match.index + 2);
                    const endPos = document.positionAt(
                        match.index + match[0].length - 1
                    );
                    const range = new vscode.Range(startPos, endPos);
                    const documentLink = new vscode.DocumentLink(
                        range,
                        vscode.Uri.file(localePath.zhCnFile)
                    );
                    documentLink.tooltip = localePath.desc
                        ? `CN: ${localePath.desc}`
                        : `[未找到中文] 跳转到定义`;
                    documentLinks.push(documentLink);
                }
                if (item.desc === '') {
                    const startPos = document.positionAt(match.index + 2);
                    const endPos = document.positionAt(
                        match.index + match[0].length - 1
                    );
                    const range = new vscode.Range(startPos, endPos);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `locale定义为空: ${key}`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    // 添加 code 用于区分错误类型
                    diagnostic.code = 'empty_locale';
                    diagnostics.push(diagnostic);
                }
            } else {
                // range需要排除掉t(的部分和最后的 ) 部分
                const startPos = document.positionAt(match.index + 2);
                const endPos = document.positionAt(
                    match.index + match[0].length - 1
                );
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
            const regex = /(?<![a-zA-Z])t\(['"`]([^'"`]*)/;
            const match = linePrefix.match(regex);

            if (!match) {
                return undefined;
            }

            const filePath = document.uri.fsPath;
            const prefix = match[1] || '';

            if (prefix.includes('${')) {
                return undefined;
            }

            const localeItems = getLocalesData(
                join(filePath, '../locales'),
                prefix
            );

            return localeItems.map((item, index) => {
                const completionItem = new vscode.CompletionItem(
                    item.label,
                    vscode.CompletionItemKind.Text
                );
                completionItem.detail = item.desc;
                completionItem.insertText = item.value;
                completionItem.sortText = index.toString();
                return completionItem;
            });
        },
    },
    "'",
    '"',
    '(',
    '`'
);

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
        // 先判断key是不是命名空间的形式或者entity的形式
        if (key.includes(':')) {
            console.log('命名空间形式的key需要找到对应的文件');
            const { path, error } = addKeyToLocale(key, '');
            if (error) {
                vscode.window.showErrorMessage(error);
                return;
            }
            vscode.window.showTextDocument(vscode.Uri.file(path!));
            return;
        }
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

export function activateOakLocale(context: vscode.ExtensionContext) {
    const enabledI18n = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('i18n');
    if (!enabledI18n) {
        console.log('i18n 相关功能已禁用');
        return;
    }
    context.subscriptions.push(oakLocalesProvider);
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(documentLinkProvider);
    context.subscriptions.push(addLocaleActionProvider);
    context.subscriptions.push(addLocaleCommand);
    console.log('oakLocale插件已激活');
}

export function deactivateOakLocale() {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
    documentLinkProvider.dispose();
    addLocaleActionProvider.dispose();
    addLocaleCommand.dispose();
}

// 监控配置项修改
vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('oak-assistant.i18n')) {
        // 提示重新加载
        vscode.window
            .showInformationMessage(
                '配置已更新，是否重新加载以应用更改？',
                '是',
                '否'
            )
            .then((selection) => {
                if (selection === '是') {
                    vscode.commands.executeCommand(
                        'workbench.action.reloadWindow'
                    );
                }
            });
    }
});
