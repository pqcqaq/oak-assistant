import * as vscode from 'vscode';
import { entityConfig } from '../utils/entities';

let provider: vscode.Disposable | undefined;

const entityProviders = {
    activate: (context: vscode.ExtensionContext) => {
        const enabled = vscode.workspace
            .getConfiguration('oak-assistant')
            .get('entityJump');
        if (!enabled) {
            console.log('Entity Jump is disabled');
            return;
        }
        provider = vscode.languages.registerDocumentLinkProvider(
            { scheme: 'file' },
            {
                provideDocumentLinks(
                    document: vscode.TextDocument
                ): vscode.DocumentLink[] {
                    const links: vscode.DocumentLink[] = [];
                    const regex =
                        /[\$]?entity[:=]\s*(['"])([a-zA-Z0-9_\s]+)\1[,\n]/g;
                    const text = document.getText();
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        const entityName = match[2];
                        if (!entityConfig.entityNameList.includes(entityName)) {
                            continue;
                        }
                        const start = document.positionAt(match.index);
                        const end = document.positionAt(
                            match.index + match[0].length
                        );
                        const range = new vscode.Range(start, end);
                        const uri = vscode.Uri.parse(
                            `command:oak-entities.jumpToDefinition?${encodeURIComponent(
                                JSON.stringify({ entityName })
                            )}`
                        );
                        const link = new vscode.DocumentLink(range, uri);
                        link.tooltip = `跳转到定义: ${entityName}`;
                        links.push(link);
                    }
                    return links;
                },
            }
        );
        context.subscriptions.push(provider);
    },
    dispose() {
        provider?.dispose();
    },
};

// 监控配置修改
vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('oak-assistant.entityJump')) {
        // 提示重新加载
        vscode.window
            .showInformationMessage(
                '配置已更新，是否重新加载以应用更改？',
                '是',
                '否'
            )
            .then((selection) => {
                if (selection === '是') {
                    vscode.commands.executeCommand(
                        'workbench.action.reloadWindow'
                    );
                }
            });
    }
});

export default entityProviders;
