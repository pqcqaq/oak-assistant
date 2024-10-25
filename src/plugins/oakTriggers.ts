import * as vscode from 'vscode';
import {
    checkAllTriggers,
    checkPathTrigger,
    updateTriggerByPath,
} from '../utils/triggers';

const triggersDiagnostics =
    vscode.languages.createDiagnosticCollection('oakTriggers');

class TriggerDocumentLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        updateTriggerByPath(document.uri.fsPath);
        const res = checkPathTrigger(document.uri.fsPath);
        if (res) {
            // triggersDiagnostics.clear();
            triggersDiagnostics.set(vscode.Uri.file(res.path), res.diagnostics);
        }
        return [];
    }
}

const documentLinkProvider = vscode.languages.registerDocumentLinkProvider(
    { scheme: 'file', language: 'typescript' },
    new TriggerDocumentLinkProvider()
);

export const startAnaylizeAll = () => {
    const result = checkAllTriggers(); //DiagnosticCollection
    Object.keys(result).forEach((uri) => {
        triggersDiagnostics.set(vscode.Uri.file(uri), result[uri]);
    });
};

export const activateTriggerPlugin = (context: vscode.ExtensionContext) => {
    const enabled = vscode.workspace
        .getConfiguration('oak-assistant')
        .get('enableTriggerCheck');
    if (!enabled) {
        console.log('triggers检查未启用');
        return;
    }
    context.subscriptions.push(triggersDiagnostics);
    context.subscriptions.push(documentLinkProvider);
    console.log('triggers检查启用');
};

// 如果配置修改，申请重新加载工作区
vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('oak-assistant.enableTriggerCheck')) {
        deactivateTriggerPlugin();
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
export const deactivateTriggerPlugin = () => {
    triggersDiagnostics.clear();
    triggersDiagnostics.dispose();
    documentLinkProvider.dispose();
};
