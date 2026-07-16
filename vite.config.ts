import { reactRouter } from "@react-router/dev/vite";
import { sentryReactRouter } from "@sentry/react-router";
import { defineConfig, loadEnv } from "vite";
import babel from "vite-plugin-babel";

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), "");
	const isBuild = config.command === "build";
	return {
		server: {
			port: Number(env.PORT) || 5173,
			warmup: {
				clientFiles: ["./app/entry.client.tsx", "./app/root.tsx"],
				ssrFiles: ["./app/entry.server.tsx"],
			},
		},
		ssr: {
			noExternal: ["react-charts", "react-use"],
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
			// React Compiler and Sentry are skipped in dev where their per-module
			// transform cost outweighs their value.
			...(isBuild
				? [
						babel({
							include: /\.[jt]sx?$/,
							babelConfig: {
								presets: ["@babel/preset-typescript"],
								plugins: [["babel-plugin-react-compiler", {}]],
							},
						}),
						sentryReactRouter(
							{
								org: process.env.SENTRY_ORG,
								project: process.env.SENTRY_PROJECT,
								authToken: process.env.SENTRY_AUTH_TOKEN,
								telemetry: false,
								unstable_sentryVitePluginOptions: {
									applicationKey: "sendou-ink",
								},
							},
							config,
						),
					]
				: []),
		],

		test: {
			projects: ["./vitest.unit.config.ts", "./vitest.browser.config.ts"],
		},
		define: {
			__GIT_COMMIT__: JSON.stringify(process.env.RENDER_GIT_COMMIT ?? ""),
		},
		build: {
			assetsInlineLimit: (filePath: string) => {
				if (/\/locales\/[^/]+\/[^/]+\.json$/.test(filePath)) return false;

				return undefined;
			},
			sourcemap: true,
		},
		resolve: {
			tsconfigPaths: true,
		},
		optimizeDeps: {
			exclude: ["@sentry/react-router"],
			// Dependencies which are only imported by specific route modules.
			// Pre-bundling them at startup avoids mid-session re-optimization
			// and full page reloads on first navigations.
			include: [
				"@date-fns/tz",
				"@dnd-kit/core",
				"@dnd-kit/modifiers",
				"@dnd-kit/sortable",
				"@dnd-kit/utilities",
				"@epic-web/cachified",
				"@internationalized/date",
				"@remix-run/form-data-parser",
				"@tldraw/tldraw",
				"@zumer/snapdom",
				"better-sqlite3",
				"chart.js",
				"compressorjs",
				"date-fns/locale/da",
				"date-fns/locale/de",
				"date-fns/locale/en-US",
				"date-fns/locale/es",
				"date-fns/locale/fr",
				"date-fns/locale/fr-CA",
				"date-fns/locale/he",
				"date-fns/locale/it",
				"date-fns/locale/ja",
				"date-fns/locale/ko",
				"date-fns/locale/nl",
				"date-fns/locale/pl",
				"date-fns/locale/pt-BR",
				"date-fns/locale/ru",
				"date-fns/locale/zh-CN",
				"edmonds-blossom-fixed",
				"i18next-browser-languagedetector",
				"i18next-http-backend",
				"jsoncrush",
				"kysely",
				"kysely/helpers/sqlite",
				"neverthrow",
				"openskill",
				"partysocket",
				"qrcode.react",
				"react-chartjs-2",
				"react-flip-toolkit",
				"remeda",
				"remix-auth",
				"remix-auth-oauth2",
				"remix-i18next",
				"sql-formatter",
				"swr/immutable",
			],
		},
	};
});
