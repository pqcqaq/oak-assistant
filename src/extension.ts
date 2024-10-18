import * as vscode from "vscode";
import { setProjectHome, pathConfig } from "./paths";
import { join } from "path";
import { Uri } from "vscode";

let projectHome: string | undefined;

// 初始化配置
// 查找工作区的根目录中的oak.config.json文件
vscode.workspace.findFiles("oak.config.json").then((uris) => {
    if (uris.length === 0) {
        vscode.window.showErrorMessage("未找到oak.config.json文件");
        return;
    }
    const uri = uris[0];
    const fs = vscode.workspace.fs;
    fs.readFile(uri).then((content) => {
        const config = JSON.parse(content.toString());
        projectHome = join(uri.path, "../", config.projectHome);
        console.log("projectHome:", projectHome);
        // 设置projectHome
        setProjectHome(projectHome);
    });
});

export async function activate(context: vscode.ExtensionContext) {
    console.log(
        'Congratulations, your extension "oak-assistant" is now active!'
    );

    const helloOak = vscode.commands.registerCommand(
        "oak-assistant.hello-oak",
        () => {
            vscode.window.showInformationMessage(
                "Hello OAK from oak-assistant!"
            );
        }
    );

    const checkPagesAndNamespace = vscode.commands.registerCommand(
        "oak-assistant.check-pages-and-namespace",
        async () => {
            if (!projectHome) {
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

            try {
                const namespaces = await fs.readDirectory(
                    Uri.file(namespacesHome)
                );
                for (const [namespaceName, namespaceType] of namespaces) {
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
                    vscode.window.showInformationMessage("检查通过");
                }
            } catch (error) {
                vscode.window.showErrorMessage(`检查过程中发生错误: ${error}`);
            }
        }
    );

    context.subscriptions.push(helloOak, checkPagesAndNamespace);
}

export function deactivate() {}
