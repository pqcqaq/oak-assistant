export const pathConfig: {
	projectHome: string;
	get entityHome(): string;
	get triggerHome(): string;
    get checkerHome(): string;
    get pagesHome(): string;
    get namespacesHome(): string;
} = {
	projectHome: __dirname,
	get entityHome() {
		return `${this.projectHome}\\src\\entities`;
	},
	get triggerHome() {
		return `${this.projectHome}\\src\\triggers`;
	},
	get checkerHome() {
		return `${this.projectHome}\\src\\checkers`;
    },
    get pagesHome() {
        return `${this.projectHome}\\src\\pages`;
    },
    get namespacesHome() {
        return `${this.projectHome}\\web\\src\\app\\namespaces`;
    }
};

export const setProjectHome = (projectHome: string) => {
    pathConfig.projectHome = projectHome.substring(1, projectHome.length - 1);
}