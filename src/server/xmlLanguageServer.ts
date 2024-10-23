import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentPositionParams,
    CompletionItem,
    CompletionItemKind,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    Hover,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// 创建一个连接来使用Node的IPC作为传输
let connection = createConnection(ProposedFeatures.all);

// 创建一个简单的文本文档管理器
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
            },
            hoverProvider: true,
        },
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log('Workspace folder change event received.');
        });
    }

    // 发送服务器就绪通知
    connection.sendNotification("xmlLanguageServer/ready");
});

// 这个处理程序提供初始补全项。
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1,
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2,
            },
        ];
    }
);

// 这个处理程序解析补全项的附加信息。
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = 'TypeScript details';
        item.documentation = 'TypeScript documentation';
    } else if (item.data === 2) {
        item.detail = 'JavaScript details';
        item.documentation = 'JavaScript documentation';
    }
    return item;
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    const text = document.getText();
    const position = params.position;
    const offset = document.offsetAt(position);

    // 查找 {{attr}} 模式
    const regex = /{{(\w+)}}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index <= offset && offset <= match.index + match[0].length) {
            const attr = match[1];
            const type = getTypeForAttr(attr);
            return {
                contents: {
                    kind: 'markdown',
                    value: `Type of \`${attr}\`: \`${type}\``,
                },
            };
        }
    }

    return null;
});

function getTypeForAttr(attr: string): string {
    // 这里应该实现实际的类型推断逻辑
    // 为了示例，我们返回一个模拟的类型
    return `MockType<${attr}>`;
}

// 使文档管理器监听连接的所有相关事件
documents.listen(connection);

// 监听连接
connection.listen();
