import * as vscode from 'vscode';
import { join } from 'path';
import { pluginPaths } from './paths';
import fs from 'fs';
import { CreateOakComponent } from '../types';
import Handlebars from 'handlebars';

export const templateNames = {
    index: 'index.ts',
    webPcTsx: 'web.pc.tsx',
    webTsx: 'web.tsx',
    localeZhCN: 'locales\\zh_CN.json',
    styleLess: 'styles.module.less',
} as const;

export type TemplateName = keyof typeof templateNames;

export function getTemplateContent(name: TemplateName): string {
    const templateFolder = pluginPaths.templates;
    if (!fs.existsSync(templateFolder)) {
        throw new Error(`Template folder not found: ${templateFolder}`);
    }
    const templatePath = join(
        templateFolder,
        templateNames[name] + '.template'
    );
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
    }
    const template = fs.readFileSync(templatePath, 'utf-8');
    return template;
}

/**
 * 递归创建文件夹
 */
export const mkdirsSync = (dirname: string) => {
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if (mkdirsSync(join(dirname, '..'))) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
};

export const outputTemplate = (
    name: TemplateName,
    data: any,
    outPath: string
) => {
    const template = getTemplateContent(name);
    const compiledTemplate = Handlebars.compile(template);
    const result = compiledTemplate(data);
    const outputPath = join(outPath, templateNames[name]);
    // 先创建 output 目录
    mkdirsSync(join(outputPath, '../'));
    try {
        fs.writeFileSync(outputPath, result, {
            encoding: 'utf-8',
        });
    } catch (error) {
        console.error('outputTemplate error:', error);
    }
};

export const generateTemplate = (outPath: string, data: CreateOakComponent) => {
    outputTemplate('webPcTsx', data.webPcTsx, outPath);
    outputTemplate('webTsx', data.webTsx, outPath);
    outputTemplate('localeZhCN', data.localeZhCN, outPath);
    outputTemplate('styleLess', data.styleLess, outPath);
    // 因为这里涉及到组件的扫描，index.ts 文件需要在最后生成
    outputTemplate('index', data.index, outPath);
};
