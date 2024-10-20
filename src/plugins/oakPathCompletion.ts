import * as vscode from 'vscode';
import ts, { Identifier, LiteralType } from 'typescript';
import { getProjectionList } from '../utils/entities';

console.log('oakPathCompletion enabled');

let currentEditingDocument: ts.Program | null = null;
let sourceFile: ts.SourceFile | null = null;

const TRIGGER_CHARACTER = '.';

const oakPathCompletion = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescriptreact' },
    {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
        ) {
            // 检查是否在正确的上下文中触发
            const linePrefix = document
                .lineAt(position)
                .text.substring(0, position.character);
            if (!linePrefix.endsWith('oakPath={`${oakFullpath}.')) {
                return undefined;
            }

            // 打开当前编辑的文件
            if (!currentEditingDocument) {
                currentEditingDocument = ts.createProgram({
                    rootNames: [document.fileName],
                    options: {},
                });
            }

            // 使用ts的api，解析文档，得到当前的WebComponentProps的第二个泛型参数的字符串
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
                    // 这里有了这个function的定义, 下面取出第一个参数
                    const firstParameter = node.parameters[0];
                    if (!firstParameter) {
                        return;
                    }
                    const typeRef = firstParameter.type;
                    if (!typeRef) {
                        return;
                    }
                    // 名称是不是 WebComponentProps
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
                            // 获取内部的StringLiteral
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
    },
    TRIGGER_CHARACTER // 触发字符
);

// 在切换文档的时候，清空当前编辑的文档
vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) {
        return;
    }
    currentEditingDocument = null; // 清空当前编辑的文档
    sourceFile = null;
});

export default oakPathCompletion;
