import * as vscode from 'vscode';
import { checkAllTriggers, checkPathTrigger, updateTriggerByPath } from '../utils/triggers';

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
    context.subscriptions.push(triggersDiagnostics);
    context.subscriptions.push(documentLinkProvider);
    console.log('triggers检查启用');
};

// 取消注册
export const deactivateTriggerPlugin = () => {
    triggersDiagnostics.clear();
    triggersDiagnostics.dispose();
    documentLinkProvider.dispose();
};
