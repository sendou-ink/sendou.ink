const config = {
	tags: ["-lintignore"],
	ignoreBinaries: ["ffmpeg", "ffprobe", "yt-dlp"],
	astro: {
		config: ["docs/site/astro.config.ts"],
		entry: [
			"docs/site/src/content.config.ts",
			"docs/site/src/pages/**/*.astro",
			"docs/site/src/content/**/*.mdx",
			// referenced by path from astro.config.ts
			"docs/site/src/components/MarkdownContent.astro",
			"docs/site/src/components/SocialIcons.astro",
			"docs/site/src/styles/theme.css",
		],
	},
	// a `!` suffix marks the pattern as production, see https://knip.dev/features/production-mode
	entry: [
		"app/features/*/routes/**/*.{ts,tsx}!",
		"migrations/**/*.ts!",
		"scripts/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}!",
		// runs the e2e suite (also excluded from the production project below)
		"!scripts/living-docs/capture.ts!",
		".claude/skills/*/scripts/*.mjs",
		"public/sw-2.js!",
		// swapped in by vite.config.ts for production builds
		"app/features/dev-tools/dev-tools-server-hooks.stub.ts!",
	],
	project: [
		"**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,css,astro,mdx}!",
		// test code, test & dev data and build tooling
		"!e2e/**!",
		"!.claude/**!",
		"!**/tests/**!",
		"!**/*test-utils.ts!",
		"!app/{test-setup,browser-test-setup}.ts!",
		"!app/utils/Test.ts!",
		"!app/db/seed/**!",
		"!app/db/reset.ts!",
		"!scripts/living-docs/capture.ts!",
		"!vite-css-plugins.ts!",
		"!docs/site/src/plugins/**!",
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
