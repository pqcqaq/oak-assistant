import * as vscode from 'vscode';
import {
    entityConfig,
    getEntityName,
    getProjectEntityList,
    subscribe,
} from '../utils/entities';
import { componentConfig, subscribeAll } from '../utils/components';
import { join } from 'path';
import {
    getTrigersInfoByEntity,
    getTriggerCountByEntity,
    subscribeTrigger,
} from '../utils/triggers';
import { CheckerInfo, TriggerInfo } from '../types';
import {
    getCheckerCountByEntity,
    getCheckersInfoByEntity,
    subscribeChecker,
} from '../utils/checkers';

class OakTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private disposeFns: (() => void)[] = [];
    // 控制是否显示全部实体类（默认显示全部）
    // 1为显示全部，0为仅显示项目中定义的实体类，2为仅显示项目中使用到的实体类
    private showAllEntities: 0 | 1 | 2 = 1;

    // 切换显示全部实体类的方法
    toggleShowAllEntities(): void {
        this.showAllEntities = ((this.showAllEntities + 1) % 3) as 0 | 1 | 2;
        this.refresh();
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        TreeItem | undefined | null | void
    > = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        TreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public reloadNode(entity: string): void {
        this._onDidChangeTreeData.fire(
            new EntityItem(entity, vscode.TreeItemCollapsibleState.Collapsed)
        );
    }

    // 初始化方法
    constructor() {
        this.disposeFns.push(
            subscribe(() => {
                this.refresh();
            })
        );
        this.disposeFns.push(
            subscribeAll((name) => {
                this.refresh();
            })
        );
        this.disposeFns.push(
            subscribeTrigger(() => {
                this.refresh();
            })
        );
        this.disposeFns.push(
            subscribeChecker(() => {
                this.refresh();
            })
        );
    }

    getTreeItem(
        element: TreeItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
        // 最顶层
        if (!element) {
            switch (this.showAllEntities) {
                case 0:
                    const projectEntities = getProjectEntityList();
                    return [
                        new EntityItem(
                            `共 ${projectEntities.length} 个实体类`,
                            vscode.TreeItemCollapsibleState.None
                        ),
                        new EntityItem(
                            '仅显示项目中定义的实体类',
                            vscode.TreeItemCollapsibleState.None
                        ),
                        ...entityConfig.entityNameList
                            .filter((item) => {
                                return projectEntities.includes(item);
                            })
                            .map((entityName) => {
                                return new EntityItem(
                                    entityName,
                                    vscode.TreeItemCollapsibleState.Collapsed
                                );
                            }),
                    ];
                case 1:
                    return [
                        new EntityItem(
                            `共 ${entityConfig.entityNameList.length} 个实体类`,
                            vscode.TreeItemCollapsibleState.None
                        ),
                        new EntityItem(
                            '显示全部的实体类',
                            vscode.TreeItemCollapsibleState.None
                        ),
                        ...entityConfig.entityNameList.map((entityName) => {
                            return new EntityItem(
                                entityName,
                                vscode.TreeItemCollapsibleState.Collapsed
                            );
                        }),
                    ];
                case 2:
                    const usedEntities = getUsedEntityList();
                    return [
                        new EntityItem(
                            `共 ${usedEntities.length} 个实体类`,
                            vscode.TreeItemCollapsibleState.None
                        ),
                        new EntityItem(
                            '仅显示项目中使用到的实体类',
                            vscode.TreeItemCollapsibleState.None
                        ),
                        ...entityConfig.entityNameList
                            .filter((item) => {
                                return usedEntities.includes(item);
                            })
                            .map((entityName) => {
                                return new EntityItem(
                                    entityName,
                                    vscode.TreeItemCollapsibleState.Collapsed
                                );
                            }),
                    ];
            }
        }
        if (element instanceof EntityItem) {
            const children: TreeItem[] = [];
            children.push(new ComponentsItem(element.getEntityName()));
            children.push(new TriggersItem(element.getEntityName()));
            children.push(new CheckersItem(element.getEntityName()));
            return children;
        }
        if (element instanceof TriggersItem) {
            return getTrigersInfoByEntity(element.getEntityName()).map(
                (trigger) => {
                    return new TriggerItem(
                        trigger,
                        vscode.TreeItemCollapsibleState.None
                    );
                }
            );
        }
        if (element instanceof CheckersItem) {
            return getCheckersInfoByEntity(element.getEntityName()).map(
                (checker) => {
                    return new CheckerItem(
                        checker,
                        vscode.TreeItemCollapsibleState.None
                    );
                }
            );
        }
        if (element instanceof ComponentsItem) {
            return componentConfig
                .getEntityComponents(element.getEntityName())
                .map((component) => {
                    return new ComponentItem(
                        element.getEntityName(),
                        component.path
                    );
                });
        }
    }

    // 销毁方法
    dispose() {
        this.disposeFns.forEach((fn) => fn());
        this.disposeFns = [];
    }
}

function getUsedEntityList() {
    return entityConfig.entityNameList.filter((entityName) => {
        const projectEntities = getProjectEntityList();
        if (projectEntities.includes(entityName)) {
            return true;
        }
        const componentNums =
            componentConfig.getEntityComponents(entityName).length;
        const triggerNums = getTriggerCountByEntity(entityName);
        const checkerNums = getCheckerCountByEntity(entityName);
        return componentNums + triggerNums + checkerNums > 0;
    });
}

class TreeItem extends vscode.TreeItem {
    private readonly entityName: string;
    getEntityName() {
        return this.entityName;
    }
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly entity?: string
    ) {
        super(label, collapsibleState);
        this.entityName = entity || '';
    }
}

export class EntityItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        const name = getEntityName(label);
        const labelWithZhCN = name ? label + ` (${name})` : label;
        super(labelWithZhCN, collapsibleState, label);
        this.label = labelWithZhCN; // 不知道为什么，上面的super方法不生效，所以这里再设置一次
        this.contextValue = 'entityItem'; // 添加这行，用于识别右键菜单项
    }
}

export class ComponentsItem extends TreeItem {
    constructor(public readonly entity: string) {
        const count = componentConfig.getEntityComponents(entity).length;
        super(
            `项目组件 (${count})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            entity
        );
        this.contextValue = 'componentsItem'; // 添加这行，用于识别右键菜单项
    }
}

export class ComponentItem extends TreeItem {
    private readonly componentPath: string;
    getComponentPath() {
        return this.componentPath;
    }
    constructor(public readonly entity: string, public readonly path: string) {
        // 只保留最后两个\\后面的内容
        const label = path.split('\\').slice(-2).join('\\');

        super(label, vscode.TreeItemCollapsibleState.None, entity);
        // 点击之后跳转到path
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [vscode.Uri.file(join(path, 'index.ts'))],
        };
        this.componentPath = path;
        this.contextValue = 'componentItem'; // 添加这行，用于识别右键菜单项
    }
}

// Trigger相关的选项

export class TriggersItem extends TreeItem {
    constructor(public readonly entity: string) {
        const count = getTriggerCountByEntity(entity);
        super(
            `Triggers (${count})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            entity
        );
        this.contextValue = 'triggersItem'; // 添加这行，用于识别右键菜单项
    }
}

export class TriggerItem extends TreeItem {
    constructor(
        public readonly trigger: TriggerInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(trigger.name, collapsibleState);
        this.contextValue = 'triggerItem'; // 添加这行，用于识别右键菜单项
        // 命令点击后跳转到指定文件的指定位置
        const args = {
            filePath: trigger.path,
            start: trigger.pos.start,
            end: trigger.pos.end,
        };
        this.command = {
            command: 'oak-assistant.jumpToPosition',
            title: '定位到文件',
            arguments: [args],
        };
    }
}

// Checker相关的选项

export class CheckersItem extends TreeItem {
    constructor(public readonly entity: string) {
        const count = getCheckerCountByEntity(entity);
        super(
            `Checkers (${count})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            entity
        );
        this.contextValue = 'checkersItem'; // 添加这行，用于识别右键菜单项
    }
}

export class CheckerItem extends TreeItem {
    constructor(
        public readonly checker: CheckerInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(`${checker.action.join(',')}-${checker.type}`, collapsibleState);
        this.contextValue = 'checkerItem'; // 添加这行，用于识别右键菜单项
        // 命令点击后跳转到指定文件的指定位置
        const args = {
            filePath: checker.path,
            start: checker.pos.start,
            end: checker.pos.end,
        };
        this.command = {
            command: 'oak-assistant.jumpToPosition',
            title: '定位到文件',
            arguments: [args],
        };
    }
}

export const createOakTreePanel = () => {
    const treeDataProvider = new OakTreeDataProvider();
    const treeView = vscode.window.createTreeView('oak-entities', {
        treeDataProvider: treeDataProvider,
    });

    // 注册切换显示全部实体类的命令
    vscode.commands.registerCommand(
        'oak-entities.toggleShowAllEntities',
        () => {
            treeDataProvider.toggleShowAllEntities();
        }
    );

    return treeView;
};
