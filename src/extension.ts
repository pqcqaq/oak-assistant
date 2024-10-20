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

vscode.workspace.findFiles('oak.config.json', exclude).then((uris) => {
    const fs = vscode.workspace.fs;
    if (uris.length === 0) {
        // 获取当前工作区
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage(
                '未找到工作区，请打开一个文件夹后再试。'
            );
            return;
        }

        // 弹出提示消息，询问是否以根目录为工作区
        vscode.window
            .showInformationMessage(
                '未找到oak.config.json文件，是否以当前工作区根目录为项目主目录？',
                '是',
                '否'
            )
            .then((value) => {
                if (value === '是') {
                    const rootPath = workspaceFolders[0].uri.fsPath;
                    const projectPath = join(rootPath, './');
                    // 在根目录下创建oak.config.json文件
                    const content = JSON.stringify(
                        { projectHome: './' },
                        null,
                        2
                    );
                    fs.writeFile(
                        vscode.Uri.file(join(projectPath, 'oak.config.json')),
                        Buffer.from(content)
                    ).then(() => {
                        setProjectHome(projectPath);
                        vscode.window.showInformationMessage(
                            `已将项目主目录设置为: ${projectPath}`
                        );
                    });
                }
            });
        return;
    }
    const uri = uris[0];
    fs.readFile(uri).then((content) => {
        const config = JSON.parse(content.toString()) as OakConfiog;
        const projectHome = join(uri.fsPath, '..', config.projectHome);
        console.log('projectHome:', projectHome);
        // 设置projectHome
        setProjectHome(projectHome);
        // 通知已经启用
        // vscode.window.showInformationMessage('已启用oak-assistant!');
    });
});

const afterPathSet = async () => {
    setLoadingEntities(true);

    const stepList: {
        name: string;
        description: string;
        function: () => Promise<void>;
    }[] = [
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

export async function activate(context: vscode.ExtensionContext) {
    console.log(
        'Congratulations, your extension "oak-assistant" is now active!'
    );

    const helloOak = vscode.commands.registerCommand(
        'oak-assistant.hello-oak',
        () => {
            vscode.window.showInformationMessage(
                'Hello OAK from oak-assistant!'
            );
        }
    );

    const reload = vscode.commands.registerCommand(
        'oak-assistant.reload',
        () => {
            afterPathSet();
        }
    );

    createFileWatcher(context);
    try {
        activateOakLocale(context);
        context.subscriptions.push(
            helloOak,
            reload,
            checkPagesAndNamespace(),
            createOakComponent(),
            createOakTreePanel(),
            ...treePanelCommands,
            oakPathInline,
            oakPathCompletion.oakPathCompletion,
            oakPathCompletion.oakPathDocumentLinkProvider,
            ...oakPathHighlighter,
            entityProviders.selectionChangeHandler,
            entityProviders.hoverProvider,
            entityProviders.documentLinkProvider
        );
    } catch (error) {
        console.error('激活插件时出错:', error);
    }
}

export function deactivate() {
    entityProviders.dispose();
    oakPathCompletion.dispose();
    deactivateOakLocale();
}
