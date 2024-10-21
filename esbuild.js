const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const path = require("path");
const fs = require("fs").promises;

/**
 * 递归复制目录
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 */
async function copyDir(src, dest) {
	await fs.mkdir(dest, { recursive: true });
	let entries = await fs.readdir(src, { withFileTypes: true });

	for (let entry of entries) {
		let srcPath = path.join(src, entry.name);
		let destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			await copyDir(srcPath, destPath);
		} else {
			await fs.copyFile(srcPath, destPath);
			console.log(`Copied ${srcPath} to ${destPath}`);
		}
	}
}

/**
 * @type {import('esbuild').Plugin}
 */
const copyTemplatesPlugin = {
	name: "copy-templates",
	setup(build) {
		build.onEnd(async () => {
			const srcDir = path.join(__dirname, "src", "templates");
			const destDir = path.join(__dirname, "dist", "templates");

			try {
				await copyDir(srcDir, destDir);
				console.log("Templates copied successfully");
			} catch (err) {
				console.error("Error copying templates:", err);
			}
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started");
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(
					`    ${location.file}:${location.line}:${location.column}:`
				);
			});
			console.log("[watch] build finished");
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ["src/extension.ts", "src/utils/analyzeWorker.ts"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "node",
		outdir: "dist",
		entryNames: "[dir]/[name]",
		external: ["vscode"],
		logLevel: "silent",
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			copyTemplatesPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
