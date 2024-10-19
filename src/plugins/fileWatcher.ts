import * as vscode from 'vscode';
import * as path from 'path';
import { pathConfig, setProjectHome, subscribe } from '../utils/paths';
import { analyzeOakAppDomain } from '../utils/entities';
import { join } from 'path';

/**
 * 监听指定目录下的所有文件变化
 * @param directoryPath 要监听的目录路径
 * @param context 扩展上下文，用于管理订阅
 */
function watchDirectory(
    directoryPath: string,
    context: vscode.ExtensionContext,
    onCreate?: (uri: vscode.Uri, action?: 'create') => void,
    onChange?: (uri: vscode.Uri, action?: 'change') => void,
    onDelete?: (uri: vscode.Uri, action?: 'delete') => void
) {
    // 确保路径是绝对路径
    const absolutePath = path.isAbsolute(directoryPath)
        ? directoryPath
        : path.resolve(directoryPath);

    // 创建一个文件系统观察器
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(absolutePath, '**/*')
    );

    const fileEvents = [
        watcher.onDidCreate((uri) => {
            console.log(`File created: ${uri.fsPath}`);
            onCreate?.(uri, 'create');
        }),
        watcher.onDidChange((uri) => {
            console.log(`File changed: ${uri.fsPath}`);
            onChange?.(uri, 'change');
        }),
        watcher.onDidDelete((uri) => {
            console.log(`File deleted: ${uri.fsPath}`);
            onDelete?.(uri, 'delete');
        }),
    ];

    // 添加订阅
    context.subscriptions.push(...fileEvents);

    // 将观察器本身添加到订阅中，以确保它在扩展停用时被正确处理
    context.subscriptions.push(watcher);
    console.log(`Watching directory: ${absolutePath}`);

    // 返回一个取消全部订阅的函数
    return () => {
        fileEvents.forEach((event) => event.dispose());
        watcher.dispose();
    };
}

export function createFileWatcher(context: vscode.ExtensionContext) {
    // 添加一个变量来跟踪是否已经显示了提示框
    let isPromptShowing = false;

    // 监听entities目录的任何修改，一旦有变化，就显示提示框
    const handleEntityChange = (uri: vscode.Uri, action: any) => {
        // 如果已经在显示提示框，则直接返回
        if (isPromptShowing) {
            return;
        }

        const entityName = uri.fsPath
            .substring(pathConfig.entityHome.length + 1)
            .replace('.ts', '');

        // 设置标志为true，表示正在显示提示框
        isPromptShowing = true;

        // 提示文件已修改，是否执行npm run make:domain
        vscode.window
            .showInformationMessage(
                `Entity: ${entityName} ${action}d. 是否立即运行make:domain ?`,
                '是',
                '否'
            )
            .then((selection) => {
                // 重置标志为false，表示提示框已关闭
                isPromptShowing = false;
                if (selection === '是') {
                    // 执行npm run make:domain命令
                    const terminal =
                        vscode.window.createTerminal('Make Domain');
                    terminal.sendText('npm run make:domain');
                    terminal.show();
                }
            });
    };

    let disposeEntityWatcher: (() => void) | null = null;

    // 在oakPath的配置更新的时候，自动监听并重新创建文件观察器
    subscribe(() => {
        if (disposeEntityWatcher) {
            disposeEntityWatcher();
        }
        // 监听entities目录
        disposeEntityWatcher = watchDirectory(
            pathConfig.entityHome,
            context,
            handleEntityChange,
            handleEntityChange,
            handleEntityChange
        );
    });

    // 监控如果Storage.ts发生变化，则重新同步entities
    const handleStorageChange = async () => {
        analyzeOakAppDomain(pathConfig.oakAppDomainHome);
    };

    let disposeStorageWatcher: (() => void) | null = null;

    // 监听oakAppDomain目录
    subscribe(() => {
        if (disposeStorageWatcher) {
            disposeStorageWatcher();
        }

        const storageFile = join(pathConfig.oakAppDomainHome, 'Storage.ts');
        disposeStorageWatcher = watchDirectory(
            storageFile,
            context,
            undefined,
            handleStorageChange
        );
    });

    // 监控projectPath下的oak.config.json文件，如果发生变化，则重新同步entities
    let disposeConfigWatcher: (() => void) | null = null;

    const handleConfigChange = async () => {
        setProjectHome(pathConfig.projectHome);
    };

    // 监听oak.config.json文件
    subscribe(() => {
        if (disposeConfigWatcher) {
            disposeConfigWatcher();
        }
        
        const configPath = join(pathConfig.projectHome, 'oak.config.json');
        disposeConfigWatcher = watchDirectory(
            configPath,
            context,
            undefined,
            handleConfigChange
        );
    });
}
