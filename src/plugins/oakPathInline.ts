import * as vscode from 'vscode';
import * as ts from 'typescript';

console.log('oakPathInline enabled');

const COMMAND_ID = 'oak-assistant.insertOakFullpath';

const TRIGGER_CHARACTER = 'oak';

const oakPathInline = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'typescriptreact' },
    {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
        ) {
            const linePrefix = document
                .lineAt(position)
                .text.substring(0, position.character);

            // 检查是否在属性上下文中
            if (!linePrefix.endsWith('<') && !linePrefix.includes(' ')) {
                return undefined;
            }

            // 函数用于检查是否是 JSX 标签的开始
            const isJSXTagStart = (line: string) => {
                return /<[^\s/>]+/.test(line);
            };

            // 向后搜索 JSX 标签的开始
            let lineNumber = position.line;
            let componentLine = '';
            while (lineNumber >= 0) {
                const line = document.lineAt(lineNumber).text;
                if (isJSXTagStart(line)) {
                    componentLine = line;
                    break;
                }
                lineNumber--;
            }

            // 如果没有找到 JSX 标签的开始，返回 undefined
            if (!componentLine) {
                return undefined;
            }

            // 提取组件名称并检查是否以大写字母开头
            const componentMatch = componentLine.match(/<([^\s/>]+)/);
            if (!componentMatch || !/^[A-Z]/.test(componentMatch[1])) {
                return undefined;
            }

            const completionItem = new vscode.CompletionItem('oakPath');
            completionItem.insertText = 'oakPath={`${oakFullpath}`}';
            completionItem.documentation = new vscode.MarkdownString(
                '插入oakPath属性'
            );

            // 将建议项移到最前面
            completionItem.sortText = '0';

            // 设置命令，在补全项被接受后执行
            completionItem.command = {
                command: COMMAND_ID,
                title: '插入oakPath属性',
            };

            return [completionItem];
        },
    },
    TRIGGER_CHARACTER // 触发字符
);

// 注册命令
vscode.commands.registerCommand(COMMAND_ID, async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const fullText = document.getText();
    const sourceFile = ts.createSourceFile(
        document.fileName,
        fullText,
        ts.ScriptTarget.Latest,
        true
    );

    let hasOakFullpath = false;
    let insertPosition: vscode.Position | undefined;

    // 遍历 AST 查找 oakFullpath 声明和组件函数定义
    function checkForOakFullpath(node: ts.Node): void {
        if (hasOakFullpath) {
            return;
        } // 如果已经找到，就不再继续查找

        if (ts.isVariableDeclaration(node)) {
            // 检查普通变量声明
            if (node.name.getText() === 'oakFullpath') {
                hasOakFullpath = true;
            }
        } else if (ts.isBindingElement(node)) {
            // 检查解构赋值
            if (
                node.name &&
                ts.isIdentifier(node.name) &&
                node.name.text === 'oakFullpath'
            ) {
                hasOakFullpath = true;
            }
        } else if (ts.isImportDeclaration(node)) {
            // 检查导入声明
            const importClause = node.importClause;
            if (importClause && importClause.namedBindings) {
                if (ts.isNamedImports(importClause.namedBindings)) {
                    importClause.namedBindings.elements.forEach((element) => {
                        if (element.name.text === 'oakFullpath') {
                            hasOakFullpath = true;
                        }
                    });
                }
            }
        } else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
            // 检查函数参数
            node.parameters.forEach((param) => {
                if (
                    ts.isIdentifier(param.name) &&
                    param.name.text === 'oakFullpath'
                ) {
                    hasOakFullpath = true;
                }
                if (ts.isObjectBindingPattern(param.name)) {
                    param.name.elements.forEach((element) => {
                        if (
                            ts.isIdentifier(element.name) &&
                            element.name.text === 'oakFullpath'
                        ) {
                            hasOakFullpath = true;
                        }
                    });
                }
            });

            // 设置插入位置
            if (!insertPosition) {
                if (ts.isFunctionDeclaration(node) && node.body) {
                    insertPosition = document.positionAt(
                        node.body.getStart() + 1
                    );
                } else if (ts.isArrowFunction(node) && ts.isBlock(node.body)) {
                    insertPosition = document.positionAt(
                        node.body.getStart() + 1
                    );
                }
            }
        }

        // 递归检查子节点
        ts.forEachChild(node, checkForOakFullpath);
    }

    // 开始遍历 AST
    ts.forEachChild(sourceFile, checkForOakFullpath);

    if (!hasOakFullpath && insertPosition) {
        const edit = new vscode.WorkspaceEdit();
        const insertText = '\n  const { oakFullpath } = props.data;\n';
        edit.insert(document.uri, insertPosition, insertText);
        await vscode.workspace.applyEdit(edit);
    }
});

export const activateOakPathInline = (context: vscode.ExtensionContext) => {
    context.subscriptions.push(oakPathInline);
};

export const deposeOakPathInline = () => {
    oakPathInline.dispose();
};
