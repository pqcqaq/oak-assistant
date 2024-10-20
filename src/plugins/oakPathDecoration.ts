import * as vscode from 'vscode';
import ts from 'typescript';
import { getProjectionList, subscribe } from '../utils/entities';

let currentEditingDocument: ts.Program | null = null;
let sourceFile: ts.SourceFile | null = null;
let entityName: string | undefined;
let entityProjections: string[] = [];

const oakPathRegex = /`\$\{oakFullpath\}.(\w+\$?\w+?)`/g;

const oakPathDecoration = vscode.window.createTextEditorDecorationType({
    borderWidth: '1px',
    borderStyle: 'wave',
    overviewRulerColor: 'red',
    overviewRulerLane: vscode.OverviewRulerLane.Center,
    light: {
        borderColor: 'red',
        color: 'red',
    },
    dark: {
        borderColor: 'red',
        color: 'red',
    },
    textDecoration: 'line-through',
    cursor: 'pointer',
});

function updateDecorations(editor: vscode.TextEditor) {
    const fileText = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    let match: RegExpExecArray | null;

    while ((match = oakPathRegex.exec(fileText)) !== null) {
        const projection = match[1];
        if (!entityProjections.includes(projection)) {
            const startPos = editor.document.positionAt(match.index + 25);
            const endPos = editor.document.positionAt(
                match.index + 25 + projection.length
            );
            const range = new vscode.Range(startPos, endPos);

            const msg = new vscode.MarkdownString(
                `实体类：${entityName} 中不存在属性：${projection}`
            );

            const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage: msg,
            };

            decorations.push(decoration);
        }
    }

    editor.setDecorations(oakPathDecoration, decorations);
}

function parseDocument(document: vscode.TextDocument) {
    if (!currentEditingDocument) {
        currentEditingDocument = ts.createProgram({
            rootNames: [document.fileName],
            options: {},
        });
    }

    if (!sourceFile || sourceFile.fileName !== document.fileName) {
        sourceFile = currentEditingDocument.getSourceFile(document.fileName)!;
    }

    entityName = undefined;

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
            const firstParameter = node.parameters[0];
            if (!firstParameter) {
                return;
            }
            const typeRef = firstParameter.type;
            if (!typeRef) {
                return;
            }
            if (
                ts.isTypeReferenceNode(typeRef) &&
                (typeRef.typeName as ts.Identifier).escapedText ===
                    'WebComponentProps'
            ) {
                const entityNameNode = typeRef.typeArguments?.[1];
                if (entityNameNode && ts.isLiteralTypeNode(entityNameNode)) {
                    const innerNode = entityNameNode.literal;
                    if (innerNode && ts.isStringLiteral(innerNode)) {
                        entityName = innerNode.text;
                    }
                }
            }
        }
    });

    if (entityName) {
        entityProjections = getProjectionList(entityName);
    } else {
        entityProjections = [];
    }
}

function activateDecorations(editor: vscode.TextEditor) {
    parseDocument(editor.document);
    updateDecorations(editor);
}

console.log('oakPathHighlighter enabled');

let activeEditor: vscode.TextEditor | undefined = undefined;

// 订阅entity更新
subscribe(() => {
    if (activeEditor) {
        activateDecorations(activeEditor);
    }
});

// 加载完成先激活一次
if (vscode.window.activeTextEditor) {
    activeEditor = vscode.window.activeTextEditor;
    activateDecorations(activeEditor);
}

export default [
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        activeEditor = editor;
        // 清空之前的缓存
        currentEditingDocument = null;
        sourceFile = null;
        entityName = undefined;
        entityProjections = [];
        if (editor) {
            activateDecorations(editor);
        }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
        if (activeEditor && event.document === activeEditor.document) {
            updateDecorations(activeEditor);
        }
    }),
];
