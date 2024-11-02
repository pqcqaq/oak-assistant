import * as vscode from 'vscode';
import {
    checkAllCheckers,
    checkPathChecker,
    updateCheckerByPath,
} from '../utils/checkers';

const checkersDiagnostics =
    vscode.languages.createDiagnosticCollection('oakCheckers');

class CheckerDocumentLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        updateCheckerByPath(document.uri.fsPath);
        const res = checkPathChecker(document.uri.fsPath);
        if (res) {
            // checkersDiagnostics.clear();
            checkersDiagnostics.set(vscode.Uri.file(res.path), res.diagnostics);
        }
        return [];
    }
}

const documentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'typescript' },
    new CheckerDocumentLinkProvider()
);

export const startAnaylizeAll = () => {
    const result = checkAllCheckers(); //DiagnosticCollection
    Object.keys(result).forEach((uri) => {
        checkersDiagnostics.set(vscode.Uri.file(uri), result[uri]);
    });
};

export const activateCheckerPlugin = (context: vscode.ExtensionContext) => {
    const enabled = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('enableCheckerCheck');
    if (!enabled) {
        console.log('checkers检查未启用');
        return;
    }
    context.subscriptions.push(checkersDiagnostics);
    context.subscriptions.push(documentLinkProvider);
    console.log('checkers检查启用');
};

// 如果配置修改，申请重新加载工作区
vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('oak-assistant.enableCheckerCheck')) {
        deactivateCheckerPlugin();
        vscode.window
            .showInformationMessage('配置已修改，请重新加载', '重新加载')
            .then((res) => {
                if (res === '重新加载') {
                    vscode.commands.executeCommand(
                        'workbench.action.reloadWindow'
                    );
                }
            });
    }
});

// 取消注册
export const deactivateCheckerPlugin = () => {
    checkersDiagnostics.clear();
    checkersDiagnostics.dispose();
    documentLinkProvider.dispose();
};
