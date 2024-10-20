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

// 在切换文档的时候，清空当前编辑的文档
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
        return;
    }
    currentEditingDocument = null;
    sourceFile = null;
});

export default oakPathCompletion;
