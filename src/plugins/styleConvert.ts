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

        const actions: vscode.CodeAction[] = [];

        if (classNameAttr.type === 'string') {
            const fix = new vscode.CodeAction(
                '转换为ModuleLess写法',
                vscode.CodeActionKind.QuickFix
            );
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(
                document.uri,
                classNameAttr.range,
                this.convertToModuleStyle(classNameAttr.text)
            );
            actions.push(fix);
        } else if (classNameAttr.type === 'module') {
            const fix = new vscode.CodeAction(
                '转换为模板字符串',
                vscode.CodeActionKind.QuickFix
            );
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(
                document.uri,
                classNameAttr.range,
                this.convertToTemplateString(classNameAttr.text)
            );
            actions.push(fix);
        }

        return actions;
    }

    private getClassNameAttr(
        document: vscode.TextDocument,
        range: vscode.Range
    ):
        | { text: string; range: vscode.Range; type: 'string' | 'module' }
        | undefined {
        const line = document.lineAt(range.start.line);
        const stringClassNameMatch = line.text.match(
            /className\s*=\s*(['"])([^'"]+)(['"])/
        );
        if (stringClassNameMatch) {
            const start = line.text.indexOf(stringClassNameMatch[0]);
            const end = start + stringClassNameMatch[0].length;
            return {
                text: stringClassNameMatch[0],
                range: new vscode.Range(
                    range.start.line,
                    start,
                    range.start.line,
                    end
                ),
                type: 'string',
            };
        }

        const moduleClassNameMatch = line.text.match(
            /className\s*=\s*\{Styles\.([^}]+)\}/
        );
        if (moduleClassNameMatch) {
            const start = line.text.indexOf(moduleClassNameMatch[0]);
            const end = start + moduleClassNameMatch[0].length;
            return {
                text: moduleClassNameMatch[0],
                range: new vscode.Range(
                    range.start.line,
                    start,
                    range.start.line,
                    end
                ),
                type: 'module',
            };
        }
    }

    private convertToModuleStyle(classNameAttr: string): string {
        const classes = classNameAttr.match(/(['"])([^'"]+)(['"])/)?.[2];
        if (!classes) {
            return classNameAttr;
        }

        const classArray = classes.split(' ');
        if (classArray.length === 1) {
            return `className={Styles.${classArray[0]}}`;
        } else {
            const convertedClasses = classArray
                .map((cls) => `\${Styles.${cls}}`)
                .join(' ');
            return `className={\`${convertedClasses}\`}`;
        }
    }

    private convertToTemplateString(classNameAttr: string): string {
        const className = classNameAttr.match(/Styles\.([^}]+)/)?.[1];
        if (!className) {
            return classNameAttr;
        }
        return `className={\`\${Styles.${className}}\`}`;
    }
}

const provider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file', language: 'typescriptreact' },
    new ClassNameConversionProvider(),
    {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
);

export function activateStyleConvert(context: vscode.ExtensionContext) {
    context.subscriptions.push(provider);
}

export function deactivateStyleConvert() {
    provider.dispose();
}
