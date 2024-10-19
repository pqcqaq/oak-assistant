import * as vscode from 'vscode';
import { entityConfig, subscribe } from '../utils/entities';

class OakTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private listenerDispose: (() => void) | null = null;

    private _onDidChangeTreeData: vscode.EventEmitter<
        TreeItem | undefined | null | void
    > = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        TreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // 初始化方法
    constructor() {
        this.listenerDispose = subscribe(() => {
            this.refresh();
        });
    }

    getTreeItem(
        element: TreeItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
        // 最顶层
        if (!element) {
            return entityConfig.entityNameList.map((entityName) => {
                return new EntityItem(
                    entityName,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
            });
        }
    }

    // 销毁方法
    dispose() {
        if (this.listenerDispose) {
            this.listenerDispose();
        }
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

export class EntityItem extends TreeItem {
    private readonly entityName: string;
    getEntityName() {
        return this.entityName;
    }
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.entityName = label;
        this.contextValue = 'entityItem'; // 添加这行，用于识别右键菜单项
    }
}

export const createOakTreePanel = () => {
    const treeDataProvider = new OakTreeDataProvider();
    const treeView = vscode.window.createTreeView('oak-entities', {
        treeDataProvider: treeDataProvider,
    });

    return treeView;
};
