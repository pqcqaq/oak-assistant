import * as vscode from "vscode";
import { isFileInDirectory } from "../utils/paths";
import { entityConfig } from "../utils/entities";

type CreateComponentConfig = {
	entityName: string;
	isList: boolean;
	autoProjection: boolean;
};

type ConfigStep = {
	name: keyof CreateComponentConfig;
	description: string;
	inputType: "input" | "select" | "confirm";
	options?: string[] | (() => string[] | Promise<string[]>);
	result?: string;
};

const createComponentSteps: ConfigStep[] = [
	{
		name: "entityName",
		description: "请选择实体名称",
		inputType: "select",
		options: () => entityConfig.entityNameList,
	},
	{
		name: "isList",
		description: "是否为列表",
		inputType: "confirm",
	},
	{
		name: "autoProjection",
		description: "是否注入Projection",
		inputType: "confirm",
	},
];

const createOakComponent = () => {
	const plugin = vscode.commands.registerCommand(
		"oak-assistant.create-oak-component",
		async (uri: vscode.Uri) => {
			if (!uri) {
				vscode.window.showErrorMessage("请在文件夹上右键选择此命令。");
				return;
			}

			const folderPath = uri.fsPath;
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

			if (!workspaceFolder) {
				vscode.window.showErrorMessage("无法确定工作区文件夹。");
				return;
			}

			if (!isFileInDirectory(folderPath, "pagesHome", "componentsHome")) {
				vscode.window.showWarningMessage(
					"选择的文件夹不在 pages或components 目录下，无法创建 OAK 组件。"
				);
			}

			const createComponentConfig: CreateComponentConfig = {
				entityName: "",
				isList: false,
				autoProjection: false,
			};
			for (const step of createComponentSteps) {
				if (step.inputType === "input") {
					const result = await vscode.window.showInputBox({
						prompt: step.description,
					});
					if (result) {
						(createComponentConfig as any)[step.name] = result;
					} else {
						vscode.window.showErrorMessage(
							"未输入有效值，退出创建。"
						);
						return;
					}
				} else if (step.inputType === "select") {
					const options = step.options
						? step.options instanceof Function
							? await step.options()
							: step.options
						: [];
					const result = await vscode.window.showQuickPick(options, {
						placeHolder: step.description,
					});
					if (result) {
						(createComponentConfig as any)[step.name] = result;
					} else {
						vscode.window.showErrorMessage(
							"未选择有效值，退出创建。"
						);
						return;
					}
				} else if (step.inputType === "confirm") {
					const result = await vscode.window.showInformationMessage(
						step.description,
                        "是",
                        "否"
					);
					if (result === "是") {
						(createComponentConfig as any)[step.name] = true;
					} else {
						(createComponentConfig as any)[step.name] = false;
					}
				}
			}

			vscode.window.showInformationMessage(
				`创建组件: ${createComponentConfig.entityName}`
			);
		}
	);

	return plugin;
};

export default createOakComponent;
