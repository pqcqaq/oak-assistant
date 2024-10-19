import { debounce, random } from "lodash";

export const pluginPaths: {
	root: string;
	get templates(): string;
} = {
	root: __dirname,
	get templates() {
		return `${this.root}\\templates`;
	},
};

console.log("plugin inited:", pluginPaths);

export const internalPath = {
	entities: "src\\entities",
	triggers: "src\\triggers",
	checkers: "src\\checkers",
	pages: "src\\pages",
	namespaces: "web\\src\\app\\namespaces",
	oakAppDomain: "src\\oak-app-domain",
	components: "src\\components",
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
} = {
	projectHome: "",
	get entityHome() {
		return `${this.projectHome}\\${internalPath.entities}`;
	},
	get triggerHome() {
		return `${this.projectHome}\\${internalPath.triggers}`;
	},
	get checkerHome() {
		return `${this.projectHome}\\${internalPath.checkers}`;
	},
	get pagesHome() {
		return `${this.projectHome}\\${internalPath.pages}`;
	},
	get namespacesHome() {
		return `${this.projectHome}\\${internalPath.namespaces}`;
	},
	get oakAppDomainHome() {
		return `${this.projectHome}\\${internalPath.oakAppDomain}`;
	},
	get componentsHome() {
		return `${this.projectHome}\\${internalPath.components}`;
	},
};

// 发布订阅模式
const subscribers: Map<number, () => void> = new Map();

const updateDeounced = debounce(() => {
    subscribers.forEach((callback) => callback());
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
	return pathConfig.projectHome !== "";
};

export const setProjectHome = (projectHome: string) => {
	pathConfig.projectHome = projectHome.endsWith("\\")
		? projectHome.slice(0, -1)
		: projectHome;
	updateDeounced();
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
