import * as vscode from 'vscode';
import { pathConfig } from '../utils/paths';
import { ComponentItem, EntityItem } from './oakTreePanel';
import { findEntityDefFile } from '../utils/entities';
import { join } from 'path';
import { toUpperFirst } from '../utils/stringUtils';
import fs from 'fs';
import assert from 'assert';

const pushToEntityDefinition = vscode.commands.registerCommand(
    'oak-entities.jumpToDefinition',
    async (
        item:
            | EntityItem
            | {
                  entityName: string;
              }
    ) => {
        const jumpToDefinition = async (entityName: string) => {
            const possiblePaths = findEntityDefFile(entityName);

            if (possiblePaths.length === 0) {
                vscode.window.showErrorMessage(
                    `没有找到entity的定义文件: ${entityName}`
                );
                return;
            }

            let selectedPath: string;
            if (possiblePaths.length === 1) {
                selectedPath = possiblePaths[0];
            } else {
                const selected = await vscode.window.showQuickPick(
                    possiblePaths.map((path) => ({
                        label: path,
                        description: '',
                    })),
                    { placeHolder: '选择一个entity定义文件' }
                );
                if (!selected) {
                    return;
                }
                selectedPath = selected.label;
            }

            const entityDefinitionUri = vscode.Uri.file(selectedPath);
            await vscode.window.showTextDocument(entityDefinitionUri);
        };

        if (!item) {
            // 在explorer中定位到指定文件夹
            const dir = pathConfig.entityHome;
            const uri = vscode.Uri.file(dir);
            await vscode.commands.executeCommand('revealInExplorer', uri);
            return;
        }

        if ((item as any).entityName) {
            jumpToDefinition((item as any).entityName);
            return;
        }

        assert(item instanceof EntityItem, 'item should be EntityItem');

        jumpToDefinition(item.getEntityName());
    }
);

const pushToEntitySchema = vscode.commands.registerCommand(
    'oak-entities.jumpToSchema',
    async (
        item:
            | EntityItem
            | {
                  entityName: string;
              }
    ) => {
        const openSchema = (entityName: string) => {
            // 打开schema文件
            const schemaPath = pathConfig.oakAppDomainHome;
            const schemaUri = vscode.Uri.file(
                join(schemaPath, toUpperFirst(entityName), 'Schema.ts')
            );
            vscode.window.showTextDocument(schemaUri);
        };

        if ((item as any).entityName) {
            openSchema((item as any).entityName);
            return;
        }

        assert(item instanceof EntityItem, 'item should be EntityItem');

        if (!item) {
            // 在explorer中定位到指定文件夹
            const dir = pathConfig.oakAppDomainHome;
            const uri = vscode.Uri.file(join(dir, 'EntityDict.ts'));
            await vscode.commands.executeCommand('revealInExplorer', uri);
            return;
        }

        openSchema(item.getEntityName());
    }
);

const deleteComponent = vscode.commands.registerCommand(
    'oak-entities.deleteComponent',
    async (item: ComponentItem) => {
        if (!item) {
            return;
        }
        const componentPath = item.getComponentPath();
        // 弹出提示，确认是否删除
        const result = await vscode.window.showInformationMessage(
            `确定要删除组件: ${item.label} 吗?`,
            { modal: true },
            '确定'
        );
        if (result !== '确定') {
            return;
        }
        // 删除文件夹
        fs.rmSync(componentPath, { recursive: true });
    }
);

export const treePanelCommands = [
    pushToEntityDefinition,
    pushToEntitySchema,
    deleteComponent,
];
