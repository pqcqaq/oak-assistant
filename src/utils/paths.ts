import { debounce, random } from 'lodash';
import os from "os";

// 如果系统是windows，首先采用\\ 否则默认使用/

const delimiter: string = os.platform() === 'win32' ? '\\' : '/';

export const pluginPaths: {
    root: string;
    get templates(): string;
} = {
    root: __dirname,
    get templates() {
        return `${this.root}${delimiter}templates`;
    },
};

console.log('plugin inited:', pluginPaths);

export const internalPath = {
    entities: `src${delimiter}entities`,
    triggers: `src${delimiter}triggers`,
    checkers: `src${delimiter}checkers`,
    pages: `src${delimiter}pages`,
    namespaces: `web${delimiter}src${delimiter}app${delimiter}namespaces`,
    oakAppDomain: `src${delimiter}oak-app-domain`,
    components: `src${delimiter}components`,
    locales: `src${delimiter}locales`,
};

export const pathConfig: {
    projectHome: string;
    get entityHome(): string;
    get triggerHome(): string;
    get checkerHome(): string;
    get pagesHome(): string;
    get namespacesHome(): string;
    get oakAppDomainHome(): string;
    get componentsHome(): string;
    get localesHome(): string;
} = {
    projectHome: '',
    get entityHome() {
        return `${this.projectHome}${delimiter}${internalPath.entities}`;
    },
    get triggerHome() {
        return `${this.projectHome}${delimiter}${internalPath.triggers}`;
    },
    get checkerHome() {
        return `${this.projectHome}${delimiter}${internalPath.checkers}`;
    },
    get pagesHome() {
        return `${this.projectHome}${delimiter}${internalPath.pages}`;
    },
    get namespacesHome() {
        return `${this.projectHome}${delimiter}${internalPath.namespaces}`;
    },
    get oakAppDomainHome() {
        return `${this.projectHome}${delimiter}${internalPath.oakAppDomain}`;
    },
    get componentsHome() {
        return `${this.projectHome}${delimiter}${internalPath.components}`;
    },
    get localesHome() {
        return `${this.projectHome}${delimiter}${internalPath.locales}`;
    },
};

// 发布订阅模式
const subscribers: Map<number, () => void> = new Map();

const updateDeounced = debounce(() => {
    subscribers.forEach((callback) => {
        try {
            callback();
        } catch(e) {
            console.log("error", e);
        }
    });
}, 100);

export const subscribe = (callback: () => void) => {
    /**
     *  订阅
     * 可以在一定程度上保证订阅的唯一性
     * @param callback  回调函数
     * @returns  返回一个key，用于取消订阅
     */
    const setToSubscribers = (callback: () => void) => {
        const key = random(0, 100000);
        if (subscribers.has(key)) {
            return setToSubscribers(callback);
        }
        subscribers.set(key, callback);
        return key;
    };

    const key = setToSubscribers(callback);

    return () => {
        subscribers.delete(key);
    };
};

export const isConfigReady = (): boolean => {
    return pathConfig.projectHome !== '';
};

export const setProjectHome = (projectHome: string) => {
    const newHome = (projectHome.endsWith('\\') || projectHome.endsWith('/'))
        ? projectHome.slice(0, -1)
        : projectHome;
    if (newHome !== pathConfig.projectHome) {
        pathConfig.projectHome = newHome;
        updateDeounced();
    }
};

export const isFileInDirectory = (
    file: string,
    ...directory: (keyof typeof pathConfig)[]
): boolean => {
    return directory.some((dir) => {
        const pathGetter = pathConfig[dir];
        return file.startsWith(pathGetter);
    });
};

export function normalizePath(path: string): string {
    // 将路径分割为数组
    const pathParts = path.replace(/\\/g, '/').split('/');
    const normalizedParts = [];

    // 处理盘符大小写
    if (pathParts[0].endsWith(':')) {
        normalizedParts.push(pathParts[0].toUpperCase());
        pathParts.shift();
    }

    // 遍历路径部分
    for (const part of pathParts) {
        if (part === '.') {
            // 忽略 '.'
            continue;
        } else if (part === '..') {
            // 处理 '..'
            if (
                normalizedParts.length > 0 &&
                normalizedParts[normalizedParts.length - 1] !== '..'
            ) {
                normalizedParts.pop();
            } else {
                normalizedParts.push('..');
            }
        } else {
            normalizedParts.push(part);
        }
    }

    // 拼接规范化后的路径
    const outPath = normalizedParts.join(delimiter);
    return outPath.endsWith(delimiter) ? outPath.slice(0, -1) : outPath;
}

// 判断一个路径是不是相对路径
export function isRelativePath(path: string): boolean {
    return path.startsWith('.') || path.startsWith('..');
}
