import * as vscode from 'vscode';
import { pathConfig } from '../utils/paths';
import { EntityItem } from './oakTreePanel';
import { findEntityDefFile } from '../utils/entities';

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

export const treePanelCommands = [pushToEntityDefinition];
