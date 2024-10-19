import * as vscode from "vscode";
import { isConfigReady, pathConfig } from "../utils/paths";
import { Uri } from "vscode";
import { join } from "path";

const checkPageAndNamespacePlugin = () => {
	const checkPagesAndNamespace = vscode.commands.registerCommand(
		"oak-assistant.check-pages-and-namespace",
		async () => {
			if (!isConfigReady()) {
				vscode.window.showErrorMessage(
					"配置未初始化，请检查oak.config.json文件"
				);
				return;
			}

			let errorNums: number = 0;
			const fs = vscode.workspace.fs;
			const pagesHome = pathConfig.pagesHome;
			const namespacesHome = pathConfig.namespacesHome;
			console.log("checking:", pagesHome, namespacesHome);
			const namespacesList: string[] = [];

			try {
				const namespaces = await fs.readDirectory(
					Uri.file(namespacesHome)
				);
				for (const [namespaceName, namespaceType] of namespaces) {
					namespacesList.push(namespaceName);

					if (namespaceType === vscode.FileType.Directory) {
						// 只检查 namespacesHome 下的第一层目录
						const pagePath = join(pagesHome, namespaceName);
						try {
							const stat = await fs.stat(Uri.file(pagePath));
							if (stat.type !== vscode.FileType.Directory) {
								vscode.window.showErrorMessage(
									`页面${namespaceName}不存在或不是目录`
								);
								errorNums++;
							}
						} catch (error) {
							vscode.window.showErrorMessage(
								`页面${namespaceName}不存在`
							);
							errorNums++;
						}
					}
				}

				if (errorNums === 0) {
					vscode.window
						.showInformationMessage(
							"检查通过",
							...namespacesList,
							"关闭"
						)
						.then((value) => {
							if (value) {
								if (value === "取消") {
									return;
								}
								// 根据选择的namespace，左侧目录结构定位到对应的页面目录
								const pagePath = join(pagesHome, value);
								vscode.commands.executeCommand(
                                    "revealInExplorer",
                                    Uri.file(pagePath)
                                );
							}
						});
				}
			} catch (error) {
				vscode.window.showErrorMessage(`检查过程中发生错误: ${error}`);
			}
		}
	);
	return checkPagesAndNamespace;
};

export default checkPageAndNamespacePlugin;
