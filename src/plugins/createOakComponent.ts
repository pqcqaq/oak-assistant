import * as vscode from 'vscode';
import { isFileInDirectory } from '../utils/paths';
import { entityConfig } from '../utils/entities';
import { CreateComponentConfig, CreateOakComponent } from '../types';
import { toUpperFirst } from '../utils/stringUtils';
import { generateTemplate } from '../utils/template';
import { join } from 'path';

type ConfigStep = {
    name: keyof CreateComponentConfig;
    description: string;
    inputType: 'input' | 'select' | 'confirm';
    options?: string[] | (() => string[] | Promise<string[]>);
    result?: string;
    // 验证内容是否合法
    validate?: (value: string) => boolean;
};

const createComponentSteps: ConfigStep[] = [
    {
        name: 'folderName',
        description: '请输入组件名称',
        inputType: 'input',
        validate: (value) => {
            // 不能是数字
            if (/\d/.test(value)) {
                return false;
            }
            // 不能是中文
            if (/[\u4e00-\u9fa5]/.test(value)) {
                return false;
            }
            return true;
        },
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

const createOakComponent = () => {
    const plugin = vscode.commands.registerCommand(
        'oak-assistant.create-oak-component',
        async (uri: vscode.Uri) => {
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

            const createComponentConfig: CreateComponentConfig = {
                folderName: '',
                entityName: '',
                isList: false,
                autoProjection: false,
            };
            for (const step of createComponentSteps) {
                if (step.inputType === 'input') {
                    const result = await vscode.window.showInputBox({
                        prompt: step.description,
                    });
                    if (result) {
                        if (step.validate && !step.validate(result)) {
                            vscode.window.showErrorMessage(
                                '输入值不合法，退出创建。'
                            );
                            return;
                        }
                        (createComponentConfig as any)[step.name] = result;
                    } else {
                        vscode.window.showErrorMessage(
                            '未输入有效值，退出创建。'
                        );
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
                    });
                    if (result) {
                        if (step.validate && !step.validate(result)) {
                            vscode.window.showErrorMessage(
                                '输入值不合法，退出创建。'
                            );
                            return;
                        }
                        (createComponentConfig as any)[step.name] = result;
                    } else {
                        vscode.window.showErrorMessage(
                            '未选择有效值，退出创建。'
                        );
                        return;
                    }
                } else if (step.inputType === 'confirm') {
                    const result = await vscode.window.showInformationMessage(
                        step.description,
                        '是',
                        '否'
                    );
                    if (result === '是') {
                        if (step.validate && !step.validate(result)) {
                            vscode.window.showErrorMessage(
                                '输入值不合法，退出创建。'
                            );
                            return;
                        }
                        (createComponentConfig as any)[step.name] = true;
                    } else {
                        (createComponentConfig as any)[step.name] = false;
                    }
                }
            }

            const desc = entityConfig.getEntityDesc(
                createComponentConfig.entityName
            );

            const entityAttrs = desc.attributes;

            const genProjections: string[] = Object.keys(entityAttrs)
                .map((attr) => {
                    const field = (entityAttrs as any)[attr];
                    if (!field) {
                        return '';
                    }
                    if (!['object', 'ref'].includes(field.type as string)) {
                        return attr;
                    }
                    return '';
                })
                .filter((attr) => !!attr);

            const data: CreateOakComponent = {
                index: {
                    entityName: createComponentConfig.entityName,
                    isList: createComponentConfig.isList,
                    autoProjection: createComponentConfig.autoProjection,
                    projectionFields: genProjections,
                },
                webPcTsx: {
                    componentName: toUpperFirst(
                        createComponentConfig.folderName
                    ),
                    entityName: createComponentConfig.entityName,
                    isList: createComponentConfig.isList,
                },
                webTsx: {
                    componentName: toUpperFirst(
                        createComponentConfig.folderName
                    ),
                    entityName: createComponentConfig.entityName,
                    isList: createComponentConfig.isList,
                },
                localeZhCN: {},
                styleLess: {},
            };

            generateTemplate(
                join(folderPath, createComponentConfig.folderName),
                data
            );

            vscode.window.showInformationMessage(
                `创建组件: ${toUpperFirst(
                    createComponentConfig.folderName
                )} 成功。`
            );
        }
    );

    return plugin;
};

export default createOakComponent;
