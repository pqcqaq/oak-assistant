import * as vscode from 'vscode';
import ts, { Identifier } from 'typescript';
import { getProjectionList } from '../utils/entities';

console.log('oakPathCompletion enabled');

let currentEditingDocument: ts.Program | null = null;
let sourceFile: ts.SourceFile | null = null;

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

            // 打开当前编辑的文件
            if (!currentEditingDocument) {
                currentEditingDocument = ts.createProgram({
                    rootNames: [document.fileName],
                    options: {},
                });
            }

            if (!sourceFile || sourceFile.fileName !== document.fileName) {
                sourceFile = currentEditingDocument.getSourceFile(
                    document.fileName
                )!;
            }

            let entityName: string | undefined;

            // 查找 WebComponentProps 的使用情况
            ts.forEachChild(sourceFile, (node) => {
                if (
                    ts.isFunctionDeclaration(node) ||
                    ts.isArrowFunction(node)
                ) {
                    const firstParameter = node.parameters[0];
                    if (!firstParameter) {
                        return;
                    }
                    const typeRef = firstParameter.type;
                    if (!typeRef) {
                        return;
                    }
                    if (
                        ts.isTypeReferenceNode(typeRef) &&
                        (typeRef.typeName as Identifier).escapedText ===
                            'WebComponentProps'
                    ) {
                        const entityNameNode = typeRef.typeArguments?.[1];
                        if (
                            entityNameNode &&
                            ts.isLiteralTypeNode(entityNameNode)
                        ) {
                            const innerNode = entityNameNode.literal;
                            if (innerNode && ts.isStringLiteral(innerNode)) {
                                entityName = innerNode.text;
                            }
                        }
                    }
                }
            });

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
    }
    // 移除这里的 TRIGGER_CHARACTER
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
                        links.push(new vscode.DocumentLink(range, uri));
                    }
                }

                return links;
            },
        }
    );

function getEntityNameFromDocument(
    document: vscode.TextDocument
): string | undefined {
    if (
        !currentEditingDocument ||
        !sourceFile ||
        sourceFile.fileName !== document.fileName
    ) {
        currentEditingDocument = ts.createProgram({
            rootNames: [document.fileName],
            options: {},
        });
        sourceFile = currentEditingDocument.getSourceFile(document.fileName)!;
    }

    let entityName: string | undefined;

    const eachChild = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
            const firstParameter = node.parameters[0];
            if (!firstParameter) {
                return;
            }
            const typeRef = firstParameter.type;
            if (!typeRef) {
                return;
            }
            if (
                ts.isTypeReferenceNode(typeRef) &&
                (typeRef.typeName as ts.Identifier).escapedText ===
                    'WebComponentProps'
            ) {
                const entityNameNode = typeRef.typeArguments?.[1];
                if (entityNameNode && ts.isLiteralTypeNode(entityNameNode)) {
                    const innerNode = entityNameNode.literal;
                    if (innerNode && ts.isStringLiteral(innerNode)) {
                        entityName = innerNode.text;
                        return;
                    }
                }
            }
        }
        // 如果没找到，继续遍历
        if (!entityName) {
            ts.forEachChild(node, eachChild);
        }
    };

    ts.forEachChild(sourceFile, eachChild);

    return entityName;
}

// 在切换文档的时候，清空当前编辑的文档
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
        return;
    }
    currentEditingDocument = null;
    sourceFile = null;
});

export default {
    oakPathCompletion,
    oakPathDocumentLinkProvider,
    dispose() {
        oakPathCompletion.dispose();
        oakPathDocumentLinkProvider.dispose();
    },
};
