import * as vscode from 'vscode';

export const createCommonPlugin = () => {
    // 注册自定义命令
    const disposable = vscode.commands.registerCommand(
        'oak-assistant.jumpToPosition',
        (args) => {
            const { filePath, start, end } = args;
            vscode.workspace.openTextDocument(filePath).then((document) => {
                vscode.window.showTextDocument(document).then((editor) => {
                    const range = new vscode.Range(
                        document.positionAt(start),
                        document.positionAt(end)
                    );
                    editor.selection = new vscode.Selection(
                        range.start,
                        range.end
                    );
                    editor.revealRange(range);
                });
            });
        }
    );
    return {
        activate: (context: vscode.ExtensionContext) => {
            context.subscriptions.push(disposable);
        },
        dispose: () => {
            disposable.dispose();
        },
    };
};
