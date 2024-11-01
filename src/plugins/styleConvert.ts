import * as vscode from 'vscode';

class ClassNameConversionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        const classNameAttr = this.getClassNameAttr(document, range);
        if (!classNameAttr) {
            return;
        }

        const fix = new vscode.CodeAction('转换为ModuleLess写法', vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.replace(
            document.uri,
            classNameAttr.range,
            this.convertToModuleStyle(classNameAttr.text)
        );

        return [fix];
    }

    private getClassNameAttr(document: vscode.TextDocument, range: vscode.Range): { text: string, range: vscode.Range } | undefined {
        const line = document.lineAt(range.start.line);
        const classNameMatch = line.text.match(/className\s*=\s*(['"])([^'"]+)(['"])/);
        if (classNameMatch) {
            const start = line.text.indexOf(classNameMatch[0]);
            const end = start + classNameMatch[0].length;
            return {
                text: classNameMatch[0],
                range: new vscode.Range(range.start.line, start, range.start.line, end)
            };
        }
    }

    private convertToModuleStyle(classNameAttr: string): string {
        const classes = classNameAttr.match(/(['"])([^'"]+)(['"])/)?.[2];
        const convertedClasses = classes?.split(' ')
            .map(cls => `\${Styles.${cls}}`)
            .join(' ');
        return `className={\`${convertedClasses}\`}`;
    }
}

const provider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new ClassNameConversionProvider(),
    {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    }
);

export function activateStyleConvert(context: vscode.ExtensionContext) {
    context.subscriptions.push(provider);
}

export function deactivateStyleConvert() {
    provider.dispose();
}
