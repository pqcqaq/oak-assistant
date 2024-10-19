import * as vscode from "vscode";
import { EntityShape } from "oak-domain/lib/types";
import { StorageDesc } from "oak-domain/lib/types/Storage";
import { join, dirname } from "path";
import fs from "fs";
import * as ts from "typescript";

export type EntityDict = {
	[key: string]: StorageDesc<EntityShape>;
};

const entityDict: EntityDict = {};

const genEntityNameList = (): string[] => {
	return Object.keys(entityDict);
};

export const entityConfig = {
	get entityNameList() {
		return genEntityNameList();
	},
};

function resolveImportPath(importPath: string, currentDir: string): string {
	if (importPath.startsWith(".")) {
		return join(currentDir, `${importPath}.ts`);
	}
	// 处理非相对路径的导入（如 node_modules）
	return importPath;
}

function getEvaluateNodeForShorthandProperty(
	program: ts.Program,
	node: ts.ShorthandPropertyAssignment,
	typeChecker: ts.TypeChecker
): any {
	const symbol = typeChecker.getSymbolAtLocation(node.name);
	if (!symbol) {
		return undefined;
	}

	// 获取符号的声明
	const declarations = symbol.declarations;
	if (!declarations || declarations.length === 0) {
		return undefined;
	}

	const declaration = declarations[0];
	// 从当前文件的所有导入中找到对应的导入
	const sourceFile = declaration.getSourceFile();
	let propertyName = "";
	const importDeclaration = sourceFile.statements.find((statement) => {
		// 在这里找到import { actions } from "./Actions" 这样的形式
		if (ts.isImportDeclaration(statement)) {
			const moduleSpecifier = statement.moduleSpecifier;
			if (ts.isStringLiteral(moduleSpecifier)) {
				const imports = statement.importClause?.namedBindings;
				// 如果导入了node.name
				if (imports && ts.isNamedImports(imports)) {
					// 这里需要注意，如果是import { generalActions as actions } from "./Actions" 这样的形式，要拿到as的内容和node.name进行比较
					return imports.elements.some((element) => {
						if (ts.isImportSpecifier(element)) {
							if (element.propertyName) {
								propertyName = element.propertyName.getText();
								// 这里要确保是as actions里的actions和node.name进行比较
								return element
									.getText()
									.endsWith(` as ${node.getText()}`);
							}
							// 这里是import { actions } from "./Actions" 这样的形式
							propertyName = element.name.getText();
							return element.name.getText() === node.getText();
						}
						return false;
					});
				}
			}
		}
		return false;
	}) as ts.ImportDeclaration | undefined;

	// 这里对包内的genericActions做特殊处理
	if (propertyName === "genericActions") {
		return [
			"count",
			"stat",
			"download",
			"select",
			"aggregate",
			"create",
			"remove",
			"update",
		];
	}

	if (importDeclaration) {
		// 得到导入的路径
		const importPath = (
			importDeclaration.moduleSpecifier as ts.StringLiteral
		).text;
		const currentSourceFile = node.getSourceFile();
		const resolvedPath = resolveImportPath(
			importPath,
			dirname(currentSourceFile.fileName)
		);

		// 创建新的程序来解析导入的文件
		const importProgram = ts.createProgram(
			[resolvedPath],
			program.getCompilerOptions()
		);
		const importSourceFile = importProgram.getSourceFile(resolvedPath);

		if (importSourceFile) {
			let foundDeclaration: ts.Node | undefined;
			ts.forEachChild(importSourceFile, (child) => {
				if (ts.isVariableStatement(child)) {
					const declaration = child.declarationList.declarations[0];
					if (
						ts.isIdentifier(declaration.name) &&
						declaration.name.text === propertyName
					) {
						foundDeclaration = declaration;
					}
				} else if (
					ts.isFunctionDeclaration(child) &&
					child.name &&
					child.name.text === propertyName
				) {
					foundDeclaration = child;
				} else if (
					ts.isExportAssignment(child) &&
					ts.isIdentifier(child.expression) &&
					child.expression.text === propertyName
				) {
					foundDeclaration = child;
				}
			});

			if (foundDeclaration) {
				return evaluateNode(
					importProgram,
					foundDeclaration,
					importProgram.getTypeChecker()
				);
			}
		}
	}
	// 如果没有找到导入声明，则假设它是当前文件中的定义
	return evaluateNode(program, declaration, typeChecker);
}

function evaluateNode(
	program: ts.Program,
	node: ts.Node,
	typeChecker: ts.TypeChecker
): any {
	if (ts.isObjectLiteralExpression(node)) {
		return node.properties.reduce((obj: any, prop) => {
			if (ts.isShorthandPropertyAssignment(prop)) {
				// 得到标识符的名称
				const name = prop.name.getText();
				const evaluated = getEvaluateNodeForShorthandProperty(
					program,
					prop,
					typeChecker
				);
				obj[name] = evaluated;
			} else if (ts.isPropertyAssignment(prop)) {
				const name = prop.name.getText();
				obj[name] = evaluateNode(
					program,
					prop.initializer,
					typeChecker
				);
			}
			return obj;
		}, {});
	} else if (ts.isArrayLiteralExpression(node)) {
		return node.elements.map((element) =>
			evaluateNode(program, element, typeChecker)
		);
	} else if (ts.isStringLiteral(node)) {
		return node.text;
	} else if (ts.isNumericLiteral(node)) {
		return Number(node.text);
	} else if (node.kind === ts.SyntaxKind.TrueKeyword) {
		return true;
	} else if (node.kind === ts.SyntaxKind.FalseKeyword) {
		return false;
	} else if (ts.isIdentifier(node)) {
		// 处理导入的标识符
		const symbol = typeChecker.getSymbolAtLocation(node);
		if (symbol && symbol.valueDeclaration) {
			return evaluateNode(program, symbol.valueDeclaration, typeChecker);
		}
	} else if (ts.isVariableDeclaration(node) && node.initializer) {
		// 处理变量声明
		return evaluateNode(program, node.initializer, typeChecker);
	}
	// 对于其他类型的节点，可能需要进一步处理
	return undefined;
}

function parseDescFile(
	filePath: string,
	program: ts.Program
): StorageDesc<EntityShape> | null {
	const sourceFile = program.getSourceFile(filePath);
	if (!sourceFile) {
		vscode.window.showWarningMessage(`无法解析文件: ${filePath}`);
		return null;
	}

	const typeChecker = program.getTypeChecker();
	let descObject: StorageDesc<EntityShape> | null = null;

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isVariableStatement(node)) {
			const declaration = node.declarationList.declarations[0];
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === "desc"
			) {
				if (
					declaration.initializer &&
					ts.isObjectLiteralExpression(declaration.initializer)
				) {
					descObject = evaluateNode(
						program,
						declaration.initializer,
						typeChecker
					);
				}
			}
		}
	});

	return descObject;
}

export const analyzeOakAppDomain = (path: string) => {
	const storageFile = join(path, "Storage.ts");

	if (!fs.existsSync(storageFile)) {
		vscode.window.showErrorMessage(
			"Storage.ts文件不存在，请先尝试make:domain"
		);
		return;
	}

	const program = ts.createProgram([storageFile], {});
	const sourceFile = program.getSourceFile(storageFile);

	if (!sourceFile) {
		vscode.window.showErrorMessage("无法解析Storage.ts文件");
		return;
	}

	let storageSchemaNode: ts.Node | undefined;

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isVariableStatement(node)) {
			const declaration = node.declarationList.declarations[0];
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === "storageSchema"
			) {
				storageSchemaNode = declaration.initializer;
			}
		}
	});

	if (
		!storageSchemaNode ||
		!ts.isObjectLiteralExpression(storageSchemaNode)
	) {
		vscode.window.showErrorMessage("无法找到storageSchema或格式不正确");
		return;
	}

	const importMap: { [key: string]: string } = {};

	ts.forEachChild(sourceFile, (node) => {
		if (ts.isImportDeclaration(node)) {
			const moduleSpecifier = node.moduleSpecifier;
			if (ts.isStringLiteral(moduleSpecifier)) {
				const importPath = moduleSpecifier.text;
				const importClause = node.importClause;
				if (
					importClause &&
					importClause.namedBindings &&
					ts.isNamedImports(importClause.namedBindings)
				) {
					importClause.namedBindings.elements.forEach((element) => {
						if (
							element.propertyName &&
							element.propertyName.text === "desc"
						) {
							importMap[element.name.text] = importPath;
						}
					});
				}
			}
		}
	});

	storageSchemaNode.properties.forEach((prop) => {
		if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
			const entityName = prop.name.text;
			if (ts.isIdentifier(prop.initializer)) {
				const descName = prop.initializer.text;
				const importPath = importMap[descName];
				if (importPath) {
					const resolvedPath = resolveImportPath(
						importPath,
						dirname(storageFile)
					);
					const descObject = parseDescFile(resolvedPath, program);
					if (descObject) {
						entityDict[entityName] = descObject;
					}
				} else {
					vscode.window.showWarningMessage(
						`未找到 ${descName} 的导入路径`
					);
				}
			} else {
				vscode.window.showWarningMessage(
					`${entityName} 的值不是预期的标识符`
				);
			}
		}
	});

	console.log("entityDict:", entityDict);
};
