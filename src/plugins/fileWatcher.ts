import * as vscode from 'vscode';
import * as path from 'path';
import {
    normalizePath,
    pathConfig,
    setProjectHome,
    subscribe,
} from '../utils/paths';
import { analyzeOakAppDomain, syncProjectEntityList } from '../utils/entities';
import { join } from 'path';
import {
    removeByPrefixPath,
    removeConponentFromEntity,
    updateEntityComponent,
} from '../utils/components';
import { reloadCachedPathLocale } from '../utils/locales';
import { loadConfig } from '../utils/oakConfig';
import fs from 'fs';

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
    onDelete?: (uri: vscode.Uri, action?: 'delete') => void,
    pattern = '**/*'
) {
    // 确保路径是绝对路径
    const absolutePath = path.isAbsolute(directoryPath)
        ? directoryPath
        : path.resolve(directoryPath);

    // 如果传入的是文件路径,则获取其父文件夹路径
    const isDirectory = fs.lstatSync(absolutePath).isDirectory();
    const watchPath = isDirectory ? absolutePath : path.dirname(absolutePath);
    const watchPattern = isDirectory ? pattern : path.basename(absolutePath);
    // 创建一个文件系统观察器
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(watchPath, watchPattern)
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
    console.log(
        `Watching ${isDirectory ? 'directory' : 'file'}: ${absolutePath}`
    );

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

        // 不知道为什么可能存在.git
        if (entityName.includes('.git')) {
            return;
        }

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
                    const projectPath = pathConfig.projectHome;
                    terminal.sendText(`cd ${projectPath}`);
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
        analyzeOakAppDomain(pathConfig.oakAppDomainHome, true);
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
            handleStorageChange,
            handleStorageChange
        );
    });

    // 监控projectPath下的oak.config.json文件，如果发生变化，则重新同步entities
    let disposeConfigWatcher: (() => void) | null = null;

    const handleConfigChange = async () => {
        setProjectHome(pathConfig.projectHome);
        loadConfig();
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

    // 监控components和page目录，如果发生变化，则重新解析component
    let disposeComponentWatcher: (() => void) | null = null;

    const handleComponentChange = async (uri: vscode.Uri, action: any) => {
        // 如果不是index.ts，有可能是删除操作导致，也有可能是其他文件变化
        if (uri.fsPath.indexOf('index.ts') === -1) {
            // 如果是删除操作，拼接上index.ts，以便重新解析
            if (action === 'delete') {
                removeByPrefixPath(normalizePath(uri.fsPath));
                return;
            } else {
                // 更新操作，需要判断是不是以下的文件结尾
                // 'web.tsx', 'web.pc.tsx', 'render.native.tsx', 'render.ios.tsx', 'render.android.tsx', 'index.xml'
                const ext = path.extname(uri.fsPath);
                if (ext !== '.tsx' && ext !== '.xml' && ext !== '.ts') {
                    return;
                }
                // 如果是组件文件，则需要更新entity的component
                updateEntityComponent(normalizePath(join(uri.fsPath, '..')));
                return;
            }
        }
        const componentPath = normalizePath(join(uri.fsPath, '..'));
        switch (action) {
            case 'create':
            case 'change':
                updateEntityComponent(componentPath);
                break;
            case 'delete':
                removeConponentFromEntity(componentPath);
                break;
        }
    };

    // 监听components目录
    subscribe(() => {
        if (disposeComponentWatcher) {
            disposeComponentWatcher();
        }

        const componentPath = pathConfig.componentsHome;
        const pagesHome = pathConfig.pagesHome;
        const cpns = watchDirectory(
            componentPath,
            context,
            handleComponentChange,
            handleComponentChange,
            handleComponentChange
        );
        const pages = watchDirectory(
            pagesHome,
            context,
            handleComponentChange,
            handleComponentChange,
            handleComponentChange
        );
        disposeComponentWatcher = () => {
            cpns();
            pages();
        };
    });

    // 监控entities目录，只在新增或者删除的时候更新ProjectEntityList
    let disposeProjectEntityWatcher: (() => void) | null = null;

    const handleProjectEntityChange = async (uri: vscode.Uri, action: any) => {
        if (action === 'create' || action === 'delete') {
            syncProjectEntityList();
        }
    };

    // 监听entities目录
    subscribe(() => {
        if (disposeProjectEntityWatcher) {
            disposeProjectEntityWatcher();
        }

        const entityPath = pathConfig.entityHome;
        disposeProjectEntityWatcher = watchDirectory(
            entityPath,
            context,
            handleProjectEntityChange,
            undefined,
            handleProjectEntityChange
        );
    });

    // 监控所有的**/locales目录，如果发生变化，则重新解析locales
    let disposeLocaleWatcher: (() => void) | null = null;

    const handleLocaleChange = async (path: vscode.Uri) => {
        // 重新解析locales
        reloadCachedPathLocale(path.fsPath);
    };

    // 监听locales目录
    subscribe(() => {
        if (disposeLocaleWatcher) {
            disposeLocaleWatcher();
        }

        const localePath = pathConfig.projectHome;
        disposeLocaleWatcher = watchDirectory(
            localePath,
            context,
            handleLocaleChange,
            handleLocaleChange,
            handleLocaleChange,
            '**/*.json'
        );
    });

    // 先不监控，延迟到打开文件的时候自动扫描
    // // 监控triggers目录，如果发生变化，则重新解析triggers
    // let disposeTriggerWatcher: (() => void) | null = null;

    // const handleTriggerChange = async (path: vscode.Uri) => {
    //     updateTriggerByPath(path.fsPath);
    // };

    // // 监听triggers目录
    // subscribe(() => {
    //     if (disposeTriggerWatcher) {
    //         disposeTriggerWatcher();
    //     }

    //     const triggerPath = pathConfig.triggerHome;
    //     disposeTriggerWatcher = watchDirectory(
    //         triggerPath,
    //         context,
    //         handleTriggerChange,
    //         handleTriggerChange,
    //         handleTriggerChange,
    //         '**/*.ts'
    //     );
    // });
}
