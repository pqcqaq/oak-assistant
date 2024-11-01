import path from 'path';
import * as vscode from 'vscode';

export const activate = (context: vscode.ExtensionContext) => {
    const pluginPath = path.join(
        context.extensionPath,
        'utils',
        'trigger-checker-plugin.js'
    );

    // 注册 TypeScript 语言特性提供者
    // context.subscriptions.push(
    //     vscode.languages.registerTypeScriptServerPlugin({
    //         languageIds: ['typescript', 'typescriptreact'],
    //         pluginPath,
    //         enableForWorkspaceTypeScriptVersions: true,
    //     })
    // );

    console.log('Await Checker Plugin has been activated!');
};

export function deactivate() {}
