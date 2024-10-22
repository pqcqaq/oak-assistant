import * as vscode from 'vscode';
import { entityConfig } from '../utils/entities';

const entityProviders = {
    documentLinkProvider: vscode.languages.registerDocumentLinkProvider(
        { scheme: 'file' },
        {
            provideDocumentLinks(
                document: vscode.TextDocument
            ): vscode.DocumentLink[] {
                const links: vscode.DocumentLink[] = [];
                const regex = /[\$]?entity[:=]\s*(['"])([a-zA-Z0-9_\s]+)\1[,\n]/g;
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
    ),

    dispose() {
        this.documentLinkProvider.dispose();
    },
};

export default entityProviders;
