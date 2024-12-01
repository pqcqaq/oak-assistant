import * as vscode from 'vscode';
import { join } from 'path';
import { delimiter, mkdirsSync, pluginPaths } from './paths';
import fs from 'fs';
import { CreateComponentConfig, CreateOakComponent } from '../types';
import Handlebars from 'handlebars';
import { toUpperFirst } from './stringUtils';
import { genProjections } from './entities';

export const templateNames = {
    index: 'index.ts',
    webPcTsx: 'web.pc.tsx',
    webTsx: 'web.tsx',
    localeZhCN: `locales${delimiter}zh_CN.json`,
    indexXml: 'index.xml',
    indexLess: 'index.less',
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
    const realConfig = { ...config };

    // 判断是否为Virtual
    if (realConfig.entityName === '虚拟组件') {
        realConfig.isVirtual = true;
        realConfig.entityName = 'user';
        realConfig.isList = false;
        realConfig.autoProjection = false;
    }

    const componentName = toUpperFirst(realConfig.folderName);

    const data: CreateOakComponent = {
        index: {
            isVirtual: realConfig.isVirtual,
            entityName: realConfig.entityName,
            isList: realConfig.isList,
            autoProjection: realConfig.autoProjection,
            projectionFields: genProjections(realConfig.entityName),
        },
        webPcTsx: {
            isVirtual: realConfig.isVirtual,
            componentName,
            entityName: realConfig.entityName,
            isList: realConfig.isList,
        },
        webTsx: {
            isVirtual: realConfig.isVirtual,
            componentName,
            entityName: realConfig.entityName,
            isList: realConfig.isList,
        },
        localeZhCN: {},
        styleLess: {},
        indexXml: {
            componentName,
        },
    };
    // render文件
    realConfig.renderFile.includes('web.pc.tsx') &&
        outputTemplate('webPcTsx', data.webPcTsx, outPath);
    realConfig.renderFile.includes('web.tsx') &&
        outputTemplate('webTsx', data.webTsx, outPath);
    realConfig.renderFile.includes('index.xml') &&
        outputTemplate('indexXml', {}, outPath);
    realConfig.renderFile.includes('index.xml') &&
        outputTemplate('indexLess', {}, outPath);
    realConfig.renderFile.includes('render.native.tsx') &&
        outputTemplate('renderNativeTsx', {}, outPath);
    realConfig.renderFile.includes('render.ios.tsx') &&
        outputTemplate('renderIosTsx', {}, outPath);
    realConfig.renderFile.includes('render.android.tsx') &&
        outputTemplate('renderAndroidTsx', {}, outPath);

    // index.json
    realConfig.renderFile.includes('index.xml') &&
        outputTemplate('indexJson', {}, outPath);
    // 其他文件
    outputTemplate('localeZhCN', data.localeZhCN, outPath);
    (realConfig.renderFile.includes('web.pc.tsx') ||
        realConfig.renderFile.includes('web.tsx')) &&
        outputTemplate('styleLess', data.styleLess, outPath);
    // 因为这里涉及到组件的扫描，index.ts 文件需要在最后生成
    outputTemplate('index', data.index, outPath);
};
