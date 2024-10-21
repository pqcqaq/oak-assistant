import * as vscode from 'vscode';
import { setProjectHome, pathConfig, subscribe } from './utils/paths';
import { join } from 'path';
import checkPagesAndNamespace from './plugins/checkPagesAndNamespace';
import { OakConfiog } from './types/OakConfig';
import createOakComponent from './plugins/createOakComponent';
import { analyzeOakAppDomain } from './utils/entities';
import { createOakTreePanel } from './plugins/oakTreePanel';
import { setLoadingEntities } from './utils/status';
import { treePanelCommands } from './plugins/treePanelCommands';
import { createFileWatcher } from './plugins/fileWatcher';
import oakPathInline from './plugins/oakPathInline';
import oakPathCompletion from './plugins/oakPathCompletion';
import oakPathHighlighter from './plugins/oakPathDecoration';
import entityProviders from './plugins/entityJump';
import { activateOakLocale, deactivateOakLocale } from './plugins/oakLocale';
import { startWorker, stopWorker, waitWorkerReady } from './utils/workers';

// 初始化配置
// 查找工作区的根目录中的oak.config.json文件，排除src和node_modules目录
const exclude: vscode.GlobPattern = new vscode.RelativePattern(
    '**',
    '{src,node_modules,lib,configuration}'
);

subscribe(() => {
    // vscode.window.showInformationMessage('配置文件已更新');
    afterPathSet();
});

const afterPathSet = async () => {
    setLoadingEntities(true);

    const stepList: {
        name: string;
        description: string;
        function: () => Promise<void>;
    }[] = [
        {
            name: '启动worker',
            description: '启动worker线程',
            function: async () => {
                startWorker();
                await waitWorkerReady();
            },
        },
        {
            name: '解析 Entity',
            description: '解析项目中的 Entity 结构',
            function: async () => {
                await analyzeOakAppDomain(pathConfig.oakAppDomainHome);
            },
        },
    ];

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: '解析oak项目结构',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: '开始分析...' });
            try {
                for (let i = 0; i < stepList.length; i++) {
                    const step = stepList[i];
                    progress.report({
                        message: step.description,
                        increment: 100 / stepList.length,
                    });
                    await step.function();
                }
                vscode.window.showInformationMessage('分析完成');
            } catch (error) {
                vscode.window.showErrorMessage(`分析过程中出错: ${error}`);
            }
        }
    );

    setLoadingEntities(false);
};

const helloOak = vscode.commands.registerCommand(
    'oak-assistant.hello-oak',
    () => {
        vscode.window.showInformationMessage('Hello OAK from oak-assistant!');
    }
);

const reload = vscode.commands.registerCommand('oak-assistant.reload', () => {
    stopWorker();
    afterPathSet();
});

const checkPagesAndNamespacePlugin = checkPagesAndNamespace();
const createOakComponentPlugin = createOakComponent();
const createOakTreePanelPlugin = createOakTreePanel();

export async function activate(context: vscode.ExtensionContext) {
    const loadPlugin = () => {
        try {
            activateOakLocale(context);
            context.subscriptions.push(
                helloOak,
                reload,
                checkPagesAndNamespacePlugin,
                createOakComponentPlugin,
                createOakTreePanelPlugin,
                ...treePanelCommands,
                oakPathInline,
                oakPathCompletion.oakPathCompletion,
                oakPathCompletion.oakPathDocumentLinkProvider,
                ...oakPathHighlighter,
                entityProviders.selectionChangeHandler,
                entityProviders.hoverProvider,
                entityProviders.documentLinkProvider
            );
            createFileWatcher(context);
        } catch (error) {
            console.error('激活插件时出错:', error);
        }
    };

    console.log(
        'Congratulations, your extension "oak-assistant" is now active!'
    );

    const uris = await vscode.workspace.findFiles('oak.config.json', exclude);
    const fs = vscode.workspace.fs;
    if (uris.length === 0) {
        // 获取当前工作区
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // 弹出提示消息，询问是否以根目录为工作区
        const value = await vscode.window.showInformationMessage(
            '未找到oak.config.json文件，是否以当前工作区根目录为项目主目录，创建配置并启用Oak-Assistant插件？',
            '是',
            '否'
        );
        if (value === '是') {
            const rootPath = workspaceFolders[0].uri.fsPath;
            const projectPath = join(rootPath, './');
            // 在根目录下创建oak.config.json文件
            const content = JSON.stringify({ projectHome: './' }, null, 2);
            fs.writeFile(
                vscode.Uri.file(join(projectPath, 'oak.config.json')),
                Buffer.from(content)
            ).then(() => {
                setProjectHome(projectPath);
                vscode.window.showInformationMessage(
                    `已将项目主目录设置为: ${projectPath}`
                );
                loadPlugin();
            });
        }
        return;
    }
    const uri = uris[0];
    const contextFile = await fs.readFile(uri);
    const config = JSON.parse(contextFile.toString()) as OakConfiog;
    const projectHome = join(uri.fsPath, '..', config.projectHome);
    // 设置projectHome
    setProjectHome(projectHome);
    // 通知已经启用
    loadPlugin();
}

export function deactivate() {
    checkPagesAndNamespacePlugin.dispose();
    createOakComponentPlugin.dispose();
    createOakTreePanelPlugin.dispose();
    treePanelCommands.forEach((command) => {
        command.dispose();
    });
    oakPathHighlighter.forEach((decoration) => {
        decoration.dispose();
    });
    helloOak.dispose();
    reload.dispose();
    oakPathInline.dispose();
    entityProviders.dispose();
    oakPathCompletion.dispose();
    deactivateOakLocale();
    stopWorker();
}
