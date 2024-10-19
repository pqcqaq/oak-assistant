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

export const isConfigReady = (): boolean => {
	return pathConfig.projectHome !== "";
};

export const setProjectHome = (projectHome: string) => {
	pathConfig.projectHome = projectHome.endsWith("\\")
		? projectHome.slice(0, -1)
		: projectHome;
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
