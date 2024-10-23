import * as fs from 'fs';
import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

function createLanguageServer() {
    // 服务器是在独立的进程中启动的
    let serverModule = path.join(__dirname, 'server', 'xmlLanguageServer.js');

    if (!fs.existsSync(serverModule)) {
        console.error('Could not find server module');
        return;
    }

    // 服务器的调试选项
    // --inspect=6009: 在Node的调试器中运行服务器
    // --nolazy: 不要延迟加载
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // 如果扩展在调试模式下运行，那么调试服务器选项
    // 否则运行正常的服务器
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    // 控制语言客户端的选项
    let clientOptions: LanguageClientOptions = {
        // 为语言服务器注册xml文件
        documentSelector: [{ scheme: 'file', language: 'xml' }],
        synchronize: {
            // 通知服务器关于文件更改的事件
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc'),
        },
    };

    // 创建语言客户端并启动
    client = new LanguageClient(
        'xmlLanguageServer',
        'XML Language Server',
        serverOptions,
        clientOptions
    );
}

export async function startAndWaitForReacy(): Promise<void> {
    createLanguageServer();
    return new Promise<void>((resolve) => {
        if (client) {
            client.onNotification('xmlLanguageServer/ready', () => {
                console.log('xmlLanguageServer is ready');
                resolve();
            });
        }
        // 启动客户端。这也会启动服务器
        client.start();
    });
}

export function deactivateClient(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
