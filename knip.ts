const config = {
	ignoreExportsUsedInFile: {
		interface: true,
		type: true,
	},
	tags: ["-lintignore"],
	ignoreBinaries: ["lsof"],
	// cwd relative path inside an execSync command, which knip resolves relative to the file instead
	ignoreUnresolved: ["scripts/seed-single-variation.ts"],
	entry: [
		"app/features/*/routes/**/*.{ts,tsx}",
		"migrations/**/*.js",
		"scripts/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
		"public/sw-2.js",
		"ley.config.cjs",
		"ley-driver.cjs",
	],
	compilers: {
		css: (text: string, path: string) => {
			if (!path.endsWith(".module.css")) {
				return "";
			}
			// Match classes that start a selector (not compound classes like .foo.bar)
			// Negative lookbehind ensures . is not preceded by word chars or ]
			const classNames = [
				...text.matchAll(/(?<![a-zA-Z\d_\]])\.([a-zA-Z_][\w]*)(?=\s*[,{:])/g),
			];
			const uniqueClasses = [...new Set(classNames.map((match) => match[1]))];
			const enumMembers = uniqueClasses.map((name) => `  ${name} = '',`);
			return `enum styles {\n${enumMembers.join("\n")}\n}\nexport default styles;`;
		},
	},
};

export default config;
