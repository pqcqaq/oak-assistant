import * as vscode from 'vscode';
import { pathConfig } from '../utils/paths';
import { ComponentItem, EntityItem } from './oakTreePanel';
import { findEntityDefFile } from '../utils/entities';
import { join } from 'path';
import { toUpperFirst } from '../utils/stringUtils';
import fs from 'fs';

const pushToEntityDefinition = vscode.commands.registerCommand(
    'oak-entities.jumpToDefinition',
    async (item: EntityItem) => {
        if (!item) {
            // 在explorer中定位到指定文件夹
            const dir = pathConfig.entityHome;
            const uri = vscode.Uri.file(dir);
            await vscode.commands.executeCommand('revealInExplorer', uri);
            return;
        }

        const possiblePaths = findEntityDefFile(item.getEntityName());

        if (possiblePaths.length === 0) {
            vscode.window.showErrorMessage(
                `没有找到entity的定义文件: ${item.getEntityName()}`
            );
            return;
        }

        let selectedPath: string;
        if (possiblePaths.length === 1) {
            selectedPath = possiblePaths[0];
        } else {
            const selected = await vscode.window.showQuickPick(
                possiblePaths.map((path) => ({ label: path, description: '' })),
                { placeHolder: '选择一个entity定义文件' }
            );
            if (!selected) {
                return;
            }
            selectedPath = selected.label;
        }

        const entityDefinitionUri = vscode.Uri.file(selectedPath);
        await vscode.window.showTextDocument(entityDefinitionUri);
    }
);

const pushToEntitySchema = vscode.commands.registerCommand(
    'oak-entities.jumpToSchema',
    async (item: EntityItem) => {
        if (!item) {
            // 在explorer中定位到指定文件夹
            const dir = pathConfig.oakAppDomainHome;
            const uri = vscode.Uri.file(join(dir, 'EntityDict.ts'));
            await vscode.commands.executeCommand('revealInExplorer', uri);
            return;
        }

        // 打开schema文件
        const schemaPath = pathConfig.oakAppDomainHome;
        const schemaUri = vscode.Uri.file(
            join(schemaPath, toUpperFirst(item.getEntityName()), 'Schema.ts')
        );

        await vscode.window.showTextDocument(schemaUri);
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
