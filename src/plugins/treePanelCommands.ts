import * as vscode from 'vscode';
import { pathConfig } from '../utils/paths';
import { join, resolve } from 'path';
import { toUpperFirst } from '../utils/stringUtils';
import * as fs from 'fs';
import * as glob from 'glob';
import { EntityItem } from './oakTreePanel';

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
        const fileName = toUpperFirst(`${item.getEntityName()}.ts`);
        const possiblePaths: string[] = [];

        // 搜索 pathConfig.entityHome
        const entityHomePath = join(pathConfig.entityHome, fileName);
        if (fs.existsSync(entityHomePath)) {
            possiblePaths.push(entityHomePath);
        }

        // 搜索 node_modules 中以 oak 开头的包
        const nodeModulesPath = resolve(pathConfig.projectHome, 'node_modules');
        const oakPackages = glob.sync('oak-*/src/entities', {
            cwd: nodeModulesPath,
        });
        for (const pkg of oakPackages) {
            const pkgEntityPath = join(nodeModulesPath, pkg, fileName);
            if (fs.existsSync(pkgEntityPath)) {
                possiblePaths.push(pkgEntityPath);
            }
        }

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
