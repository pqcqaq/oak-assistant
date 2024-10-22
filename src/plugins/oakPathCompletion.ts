import * as vscode from 'vscode';
import { getProjectionList } from '../utils/entities';
import { join } from 'path';
import fs from 'fs';
import { getOakComponentData } from '../utils/components';

console.log('oakPathCompletion enabled');

const oakPathCompletion = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescriptreact' },
    {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
        ) {
            const linePrefix = document
                .lineAt(position)
                .text.substring(0, position.character);

            // 修改这里，检查是否在 `${oakFullpath}.` 之后
            const oakPathRegex = /`\$\{oakFullpath\}\./;
            if (!oakPathRegex.test(linePrefix)) {
                return undefined;
            }

            const entityName = getEntityNameFromDocument(document);

            if (!entityName) {
                return undefined;
            }

            const entityProjections = getProjectionList(entityName);

            // 创建补全项
            const completionItems = entityProjections.map((projection) => {
                const completionItem = new vscode.CompletionItem(
                    projection,
                    vscode.CompletionItemKind.Property
                );
                completionItem.detail = `Entity projection: ${projection}`;
                completionItem.documentation = new vscode.MarkdownString(
                    `Adds the \`${projection}\` projection to the oakPath`
                );
                return completionItem;
            });

            return completionItems;
        },
    },
    '.' // triggered whenever a '.' is being typed
);

// 新增文档链接提供器
const oakPathDocumentLinkProvider =
    vscode.languages.registerDocumentLinkProvider(
        { scheme: 'file', language: 'typescriptreact' },
        {
            provideDocumentLinks(
                document: vscode.TextDocument
            ): vscode.DocumentLink[] {
                // 获取实体名称
                let entityName = getEntityNameFromDocument(document);
                if (!entityName) {
                    return [];
                }

                const links: vscode.DocumentLink[] = [];
                const text = document.getText();
                const regex = /`\$\{oakFullpath\}.(\w+\$?\w+?)`/g;
                let match;

                while ((match = regex.exec(text)) !== null) {
                    const start = document.positionAt(match.index);
                    const end = document.positionAt(
                        match.index + match[0].length
                    );
                    const range = new vscode.Range(start, end);

                    // 检查投影是否正确
                    const projections = getProjectionList(entityName);
                    if (projections.includes(match[1])) {
                        const uri = vscode.Uri.parse(
                            `command:oak-entities.jumpToSchema?${encodeURIComponent(
                                JSON.stringify({ entityName })
                            )}`
                        );
                        const link = new vscode.DocumentLink(range, uri);
                        link.tooltip = `跳转到实体Schema: ${entityName}`;
                        links.push(link);
                    }
                }

                return links;
            },
        }
    );

function getEntityNameFromDocument(
    document: vscode.TextDocument
): string | undefined {
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
    return data.entityName;
}

// 在切换文档的时候，清空当前编辑的文档
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
        return;
    }
});

export default {
    oakPathCompletion,
    oakPathDocumentLinkProvider,
    dispose() {
        oakPathCompletion.dispose();
        oakPathDocumentLinkProvider.dispose();
    },
};
