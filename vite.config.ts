import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import babel from "vite-plugin-babel";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults } from "vitest/config";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	return {
		server: {
			port: Number(env.PORT) || 5173,
		},
		ssr: {
			noExternal: ["react-charts", "react-use"],
		},
		esbuild: {
			supported: {
				"top-level-await": true, //browsers can handle top-level-await features
			},
		},
		plugins: [
			{
				// Wraps CSS modules in @layer components so utility classes always win.
				// The layer order declaration is prepended to each module because in Vite
				// dev mode, module <style> tags are injected before global stylesheets —
				// without it the implicit first @layer components would get lowest priority.
				name: "css-modules-layer",
				enforce: "pre",
				transform(code, id) {
					if (!id.endsWith(".module.css")) return;
					const layerOrder =
						"@layer reset, base, elements, components, utilities;";
					const layer = id.includes("/components/elements/")
						? "elements"
						: "components";
					return {
						code: `${layerOrder}\n@layer ${layer} {\n${code}\n}`,
					};
				},
			},
			reactRouter(),
			babel({
				filter: /\.[jt]sx?$/,
				babelConfig: {
					presets: ["@babel/preset-typescript"],
					plugins: [["babel-plugin-react-compiler", {}]],
				},
			}),
			tsconfigPaths(),
		],
		test: {
			projects: [
				{
					extends: true,
					test: {
						name: "unit",
						include: ["**/*.test.{ts,tsx}"],
						exclude: [
							...configDefaults.exclude,
							"e2e/**",
							"**/*.browser.test.{ts,tsx}",
						],
						setupFiles: ["./app/test-setup.ts"],
					},
				},
				{
					extends: "./vitest.browser.config.ts",
				},
			],
		},
		build: {
			// this is mostly done so that i18n jsons as defined in ./app/modules/i18n/loader.ts
			// do not end up in the js bundle as minimized strings
			// if we decide later that this is a useful optimization in some cases then we can
			// switch the value to a callback one that checks the file path
			assetsInlineLimit: 0,
		},
	};
});
