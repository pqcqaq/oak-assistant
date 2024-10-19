import { join } from "path";
import { pluginPaths } from "./paths";
import fs from "fs";

export const templateNames = {
	index: "index.ts",
	webPcTsx: "web.pc.tsx",
	webTsx: "web.tsx",
	localeZhCN: "locale\\zh_CN.json",
	styleLess: "style.module.less",
} as const;

export type TemplateName = keyof typeof templateNames;

export function getTemplateContext(name: TemplateName): string {
	const templateFolder = pluginPaths.templates;
	if (!fs.existsSync(templateFolder)) {
		throw new Error(`Template folder not found: ${templateFolder}`);
	}
	const templatePath = join(templateFolder, templateNames[name] + ".template");
	if (!fs.existsSync(templatePath)) {
		throw new Error(`Template not found: ${templatePath}`);
	}
	const template = fs.readFileSync(templatePath, "utf-8");
	return template;
}

export function fillTemplate(
	template: string,
	data: Record<string, any>
): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
		return data[key] !== undefined ? data[key] : `{{${key}}}`;
	});
}

export const getFilledTemplate = (name: TemplateName, data: Record<string, any>) => {
	const template = getTemplateContext(name);
	return fillTemplate(template, data);
};
