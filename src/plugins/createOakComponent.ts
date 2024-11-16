import * as vscode from 'vscode';
import { isFileInDirectory, pathConfig } from '../utils/paths';
import { entityConfig } from '../utils/entities';
import { CreateComponentConfig } from '../types';
import { toUpperFirst } from '../utils/stringUtils';
import { generateTemplate } from '../utils/template';
import { join } from 'path';
import { ComponentsItem } from './oakTreePanel';

type ConfigStep = {
    name: keyof CreateComponentConfig;
    description: string;
    inputType: 'input' | 'select' | 'confirm';
    options?: string[] | (() => string[] | Promise<string[]>);
    defaultSelections?: string[];
    result?: string;
    many?: boolean;
    // 验证内容是否合法
    validate?: (value: string) => boolean;
};

const withSelectEntity: ConfigStep[] = [
    {
        name: 'folderName',
        description: '请输入组件名称',
        inputType: 'input',
        validate: (value) => {
            // 合法正则表达式
            return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value);
          }
    },
    {
        name: 'renderFile',
        description: '请选择需要的平台文件',
        inputType: 'select',
        options: [
            'web.tsx',
            'web.pc.tsx',
            'render.native.tsx',
            'render.ios.tsx',
            'render.android.tsx',
            'index.xml',
        ],
        defaultSelections: ['web.tsx', 'web.pc.tsx'],
        many: true,
    },
    {
        name: 'entityName',
        description: '请选择关联实体',
        inputType: 'select',
        options: () => entityConfig.entityNameList,
    },
    {
        name: 'isList',
        description: '是否为列表',
        inputType: 'confirm',
    },
    {
        name: 'autoProjection',
        description: '是否注入Projection',
        inputType: 'confirm',
    },
];

// 从withSelectEntity中排除第二步骤
const createComponentSteps: ConfigStep[] = withSelectEntity
    .slice(0, 2)
    .concat(withSelectEntity.slice(3));

const afterCreateComponent = async (folderPath: string) => {
    console.log('执行创建后操作：folderPath:', folderPath);
    // updateEntityComponent(normalizePath(join(folderPath, "index.ts")));
};

const goCreate = async (
    folderPath: string,
    steps: ConfigStep[],
    config?: Partial<CreateComponentConfig>
) => {
    const createComponentConfig: CreateComponentConfig = {
        folderName: '',
        entityName: '',
        isList: false,
        autoProjection: false,
        renderFile: [],
        ...config,
    };
    for (const step of steps) {
        if (step.inputType === 'input') {
            const result = await vscode.window.showInputBox({
                prompt: step.description,
            });
            if (result) {
                if (step.validate && !step.validate(result)) {
                    vscode.window.showErrorMessage('输入值不合法，退出创建。');
                    return;
                }
                (createComponentConfig as any)[step.name] = result;
            } else {
                // vscode.window.showErrorMessage('未输入有效值，退出创建。');
                return;
            }
        } else if (step.inputType === 'select') {
            const options = step.options
                ? step.options instanceof Function
                    ? await step.options()
                    : step.options
                : [];
            const result = await vscode.window.showQuickPick(options, {
                placeHolder: step.description,
                canPickMany: step.many,
                ignoreFocusOut: true,
            });
            if (result) {
                if (step.validate && !step.validate(result)) {
                    vscode.window.showErrorMessage('输入值不合法，退出创建。');
                    return;
                }
                (createComponentConfig as any)[step.name] = result;
            } else {
                // vscode.window.showErrorMessage('未选择有效值，退出创建。');
                return;
            }
        } else if (step.inputType === 'confirm') {
            const result = await vscode.window.showQuickPick(['是', '否'], {
                placeHolder: step.description,
                ignoreFocusOut: true,
            });
            if (result === '是') {
                if (step.validate && !step.validate(result)) {
                    vscode.window.showErrorMessage('输入值不合法，退出创建。');
                    return;
                }
                (createComponentConfig as any)[step.name] = true;
            } else {
                (createComponentConfig as any)[step.name] = false;
            }
        }
    }

    generateTemplate(
        join(folderPath, createComponentConfig.folderName),
        createComponentConfig
    );
    vscode.window.showInformationMessage(
        `创建组件: ${toUpperFirst(createComponentConfig.folderName)} 成功。`
    );

    afterCreateComponent(join(folderPath, createComponentConfig.folderName));
};

const plugin = vscode.commands.registerCommand(
    'oak-assistant.create-oak-component',
    async (uri: vscode.Uri | ComponentsItem) => {
        if (uri instanceof ComponentsItem) {
            const entityName = uri.getEntityName();
            const componentsPath = join(pathConfig.componentsHome, entityName);
            goCreate(componentsPath, createComponentSteps, {
                entityName,
            });
            return;
        }
        if (!uri) {
            vscode.window.showErrorMessage('请在文件夹上右键选择此命令。');
            return;
        }

        const folderPath = uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('无法确定工作区文件夹。');
            return;
        }

        if (!isFileInDirectory(folderPath, 'pagesHome', 'componentsHome')) {
            vscode.window.showWarningMessage(
                '选择的文件夹不在 pages或components 目录下，无法创建 OAK 组件。'
            );
        }

        goCreate(folderPath, withSelectEntity);
    }
);

export const activateOakComponent = (context: vscode.ExtensionContext) => {
    context.subscriptions.push(plugin);
};

export const disposeOakComponent = () => {
    plugin.dispose();
};
