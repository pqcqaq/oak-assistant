import * as vscode from 'vscode';

let currentDecoration: vscode.TextEditorDecorationType | undefined;

function createDecorationForEntity(
    range: vscode.Range
): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
        borderWidth: '1px',
        borderStyle: 'solid',
        overviewRulerColor: 'blue',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
            borderColor: 'darkblue',
            backgroundColor: 'lightblue',
        },
        dark: {
            borderColor: 'lightblue',
            backgroundColor: 'darkblue',
        },
        cursor: 'pointer',
    });
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    const editor = event.textEditor;
    const document = editor.document;
    const selection = editor.selection;

    if (currentDecoration) {
        editor.setDecorations(currentDecoration, []);
        currentDecoration.dispose();
    }

    if (selection.isEmpty) {
        return;
    }

    const text = document.getText(selection);
    const pattern = /entity:\s*(['"])([a-zA-Z0-9_\s]+)\1,/;
    const match = text.match(pattern);

    if (match) {
        currentDecoration = createDecorationForEntity(selection);
        editor.setDecorations(currentDecoration, [{ range: selection }]);
    }
}

const entityProviders = {
    selectionChangeHandler: vscode.window.onDidChangeTextEditorSelection(
        handleSelectionChange
    ),

    hoverProvider: vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        {
            provideHover(document, position, token) {
                const pattern = /entity:\s*(['"])([a-zA-Z0-9_\s]+)\1,/;
                const range = document.getWordRangeAtPosition(
                    position,
                    pattern
                );
                if (range) {
                    const text = document.getText(range);
                    const match = text.match(pattern);
                    if (match) {
                        const entityName = match[2];
                        return new vscode.Hover(
                            `Entity: ${entityName}\n跳转到定义`
                        );
                    }
                }
            },
        }
    ),

    documentLinkProvider: vscode.languages.registerDocumentLinkProvider(
        { scheme: 'file' },
        {
            provideDocumentLinks(
                document: vscode.TextDocument
            ): vscode.DocumentLink[] {
                const links: vscode.DocumentLink[] = [];
                const regex = /entity:\s*(['"])([a-zA-Z0-9_\s]+)\1,/g;
                const text = document.getText();
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const start = document.positionAt(match.index);
                    const end = document.positionAt(
                        match.index + match[0].length
                    );
                    const range = new vscode.Range(start, end);
                    const uri = vscode.Uri.parse(
                        `command:oak-entities.jumpToDefinition?${encodeURIComponent(
                            JSON.stringify({ entityName: match[2] })
                        )}`
                    );
                    links.push(new vscode.DocumentLink(range, uri));
                }
                return links;
            },
        }
    ),

    dispose() {
        this.selectionChangeHandler.dispose();
        this.hoverProvider.dispose();
        this.documentLinkProvider.dispose();
        if (currentDecoration) {
            currentDecoration.dispose();
        }
    },
};

export default entityProviders;
