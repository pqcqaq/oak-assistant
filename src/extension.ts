import * as vscode from 'vscode';
import {
    setProjectHome,
    pathConfig,
    subscribe,
    normalizePath,
} from './utils/paths';
import { join } from 'path';
import checkPagesAndNamespace from './plugins/checkPagesAndNamespace';
import { OakConfiog } from './types/OakConfig';
import {
    activateOakComponent,
    disposeOakComponent,
} from './plugins/createOakComponent';
import { analyzeOakAppDomain } from './utils/entities';
import { createOakTreePanel } from './plugins/oakTreePanel';
import { setLoadingEntities } from './utils/status';
import { treePanelCommands } from './plugins/treePanelCommands';
import { createFileWatcher } from './plugins/fileWatcher';
import {
    activateOakPathInline,
    deposeOakPathInline,
} from './plugins/oakPathInline';
import oakPathCompletion from './plugins/oakPathCompletion';
import oakPathHighlighter from './plugins/oakPathDecoration';
import entityProviders from './plugins/entityJump';
import { activateOakLocale, deactivateOakLocale } from './plugins/oakLocale';
import { startWorker, stopWorker, waitWorkerReady } from './utils/workers';
import { loadComponents, updateEntityComponent } from './utils/components';
import {
    activateOakComponentPropsLinkProvider,
    deactivateOakComponentPropsLinkProvider,
} from './plugins/oakComponent';
import { preLoadLocales } from './utils/locales';
import { createCommonPlugin } from './plugins/common';
import { initTriggerProgram } from './utils/triggers';
import {
    activateTriggerPlugin,
    deactivateTriggerPlugin,
} from './plugins/oakTriggers';
import {
    activateStyleConvert,
    deactivateStyleConvert,
} from './plugins/styleConvert';
import { initCheckerProgram } from './utils/checkers';
import {
    activateCheckerPlugin,
    deactivateCheckerPlugin,
} from './plugins/oakCheckers';
import { log } from './utils/logger';
import { defaultConfig, loadConfig } from './utils/oakConfig';

// 初始化配置
// 查找工作区的根目录中的oak.config.json文件，排除src和node_modules目录
const exclude: vscode.GlobPattern = new vscode.RelativePattern(
    '**',
    '{src,node_modules,lib,configuration,native,web,wechatMp}'
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
            name: '加载配置信息',
            description: '加载配置信息',
            function: async () => {
                await loadConfig();
            },
        },
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
        {
            name: '扫描组件',
            description: '导入所有组件信息',
            function: async () => {
                await loadComponents();
            },
        },
        {
            name: '加载I18n信息',
            description: '加载国际化信息',
            function: async () => {
                await preLoadLocales();
            },
        },
        {
            name: '加载当前文件数据',
            description: '加载当前文件数据',
            function: async () => {
                const currentFilePath =
                    vscode.window.activeTextEditor?.document.uri.fsPath;
                if (!currentFilePath) {
                    return;
                }
                const norPath = normalizePath(currentFilePath);
                updateEntityComponent(norPath);
            },
        },
        {
            name: '初始化trigger信息',
            description: '初始化trigger信息',
            function: async () => {
                const enabled = vscode.workspace
                    .getConfiguration('oak-assistant')
                    .get('enableTriggerCheck');
                if (!enabled) {
                    console.log('triggers检查未启用');
                    return;
                }
                await initTriggerProgram();
            },
        },
        // 初始化checker信息
        {
            name: '初始化checker信息',
            description: '初始化checker信息',
            function: async () => {
                const enabled = vscode.workspace
                    .getConfiguration('oak-assistant')
                    .get('enableCheckerCheck');
                if (!enabled) {
                    console.log('checker检查未启用');
                    return;
                }
                await initCheckerProgram();
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
            for (let i = 0; i < stepList.length; i++) {
                const step = stepList[i];
                progress.report({
                    message: step.description,
                    increment: 100 / stepList.length,
                });
                try {
                    await step.function();
                } catch (error) {
                    vscode.window.showErrorMessage(`步骤${step.name}出错: ${error}`);
                }
            }
            vscode.window.showInformationMessage('分析完成');
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
    // stopWorker();
    // afterPathSet();
    // 调用vscode的api，重新加载
    vscode.commands.executeCommand('workbench.action.reloadWindow');
});

const commonCommands = createCommonPlugin();

const checkPagesAndNamespacePlugin = checkPagesAndNamespace();
const createOakTreePanelPlugin = createOakTreePanel();

export async function activate(context: vscode.ExtensionContext) {
    const loadPlugin = (config: OakConfiog) => {
        // activateWxmlLanguageSupport(
        //     context,
        //     Object.assign({}, config.wxml, defaultWxmlConfig)
        // );
        try {
            activateOakLocale(context);
            activateOakComponentPropsLinkProvider(context);
            commonCommands.activate(context);
            entityProviders.activate(context);
            activateTriggerPlugin(context);
            activateCheckerPlugin(context);
            activateOakComponent(context);
            activateOakPathInline(context);
            context.subscriptions.push(
                helloOak,
                reload,
                checkPagesAndNamespacePlugin,
                createOakTreePanelPlugin,
                ...treePanelCommands,
                oakPathCompletion.oakPathCompletion,
                oakPathCompletion.oakPathDocumentLinkProvider,
                ...oakPathHighlighter
            );
            createFileWatcher(context);
            activateStyleConvert(context);
        } catch (error) {
            console.error('激活插件时出错:', error);
        }
    };

    console.log(
        'Congratulations, your extension "oak-assistant" is now active!'
    );

    const uris = await vscode.workspace.findFiles(
        'oak.config.json',
        exclude,
        1
    );
    const fs = vscode.workspace.fs;
    if (uris.length === 0) {
        // 获取当前工作区
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // 显示新项目提示
        const showTip = vscode.workspace.getConfiguration('oak-assistant').get('showNewProjectTip');
        
        if (!showTip) { 
            console.log('未找到oak.config.json文件，并且未开启新项目提示');
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
            const content = JSON.stringify(defaultConfig, null, 2);
            fs.writeFile(
                vscode.Uri.file(join(projectPath, 'oak.config.json')),
                Buffer.from(content)
            ).then(() => {
                setProjectHome(projectPath);
                vscode.window.showInformationMessage(
                    `已将项目主目录设置为: ${projectPath}`
                );
                loadPlugin(defaultConfig);
            });
        }
        return;
    }
    const uri = uris[0];
    const contextFile = await fs.readFile(uri);
    const config = JSON.parse(contextFile.toString()) as OakConfiog;
    if (!config.projectDir) {
        vscode.window.showErrorMessage(
            'oak.config.json文件中缺少projectDir字段'
        );
        return;
    }
    const projectHome = join(uri.fsPath, '..', config.projectDir);
    log('log', 'projectHome:', projectHome);
    // 设置projectHome
    setProjectHome(projectHome);
    // 通知已经启用
    loadPlugin(config);
}

export function deactivate() {
    // deactivateWxmlLanguageSupport();
    commonCommands.dispose();
    checkPagesAndNamespacePlugin.dispose();
    createOakTreePanelPlugin.dispose();
    deactivateTriggerPlugin();
    deactivateCheckerPlugin();
    disposeOakComponent();
    deposeOakPathInline();
    treePanelCommands.forEach((command) => {
        command.dispose();
    });
    oakPathHighlighter.forEach((decoration) => {
        decoration.dispose();
    });
    helloOak.dispose();
    reload.dispose();
    entityProviders.dispose();
    oakPathCompletion.dispose();
    deactivateOakLocale();
    deactivateOakComponentPropsLinkProvider();
    stopWorker();
    deactivateStyleConvert();
}
