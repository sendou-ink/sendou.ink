import { reactRouter } from "@react-router/dev/vite";
import { sentryReactRouter } from "@sentry/react-router";
import { defineConfig, loadEnv } from "vite";
import babel from "vite-plugin-babel";

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), "");
	return {
		server: {
			port: Number(env.PORT) || 5173,
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
		},
	};
});
