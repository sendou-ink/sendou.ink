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
