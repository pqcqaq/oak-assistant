import * as vscode from 'vscode';
import { join } from 'path';
import { pluginPaths } from './paths';
import fs from 'fs';
import { CreateComponentConfig, CreateOakComponent } from '../types';
import Handlebars from 'handlebars';
import { toUpperFirst } from './stringUtils';
import { genProjections } from './entities';

export const templateNames = {
    index: 'index.ts',
    webPcTsx: 'web.pc.tsx',
    webTsx: 'web.tsx',
    localeZhCN: 'locales\\zh_CN.json',
    indexXml: 'index.xml',
    renderNativeTsx: 'render.native.tsx',
    renderIosTsx: 'render.ios.tsx',
    renderAndroidTsx: 'render.android.tsx',
    styleLess: 'styles.module.less',
    indexJson: 'index.json',
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

export const generateTemplate = (
    outPath: string,
    config: CreateComponentConfig
) => {
    const data: CreateOakComponent = {
        index: {
            entityName: config.entityName,
            isList: config.isList,
            autoProjection: config.autoProjection,
            projectionFields: genProjections(config.entityName),
        },
        webPcTsx: {
            componentName: toUpperFirst(config.folderName),
            entityName: config.entityName,
            isList: config.isList,
        },
        webTsx: {
            componentName: toUpperFirst(config.folderName),
            entityName: config.entityName,
            isList: config.isList,
        },
        localeZhCN: {},
        styleLess: {},
    };
    // render文件
    config.renderFile.includes('web.pc.tsx') &&
        outputTemplate('webPcTsx', data.webPcTsx, outPath);
    config.renderFile.includes('web.tsx') &&
        outputTemplate('webTsx', data.webTsx, outPath);
    config.renderFile.includes('index.xml') &&
        outputTemplate('indexXml', {}, outPath);
    config.renderFile.includes('render.native.tsx') &&
        outputTemplate('renderNativeTsx', {}, outPath);
    config.renderFile.includes('render.ios.tsx') &&
        outputTemplate('renderIosTsx', {}, outPath);
    config.renderFile.includes('render.android.tsx') &&
        outputTemplate('renderAndroidTsx', {}, outPath);
    
    // index.json
    outputTemplate('indexJson', {}, outPath);
    // 其他文件
    outputTemplate('localeZhCN', data.localeZhCN, outPath);
    outputTemplate('styleLess', data.styleLess, outPath);
    // 因为这里涉及到组件的扫描，index.ts 文件需要在最后生成
    outputTemplate('index', data.index, outPath);
};
