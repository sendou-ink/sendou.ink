import { reactRouter } from "@react-router/dev/vite";
import MagicString from "magic-string";
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
		plugins: [
			{
				// Vite dev serves everything with no-cache, so any <head> mutation (e.g. a prefetch
				// link mounting) revalidates the woff2 and flashes fallback fonts while the 304
				// round-trips. Fonts never change, so dev caches them hard like the production build.
				name: "cache-fonts-in-dev",
				apply: "serve",
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						if (req.url?.includes("/fonts/") && req.url.includes(".woff2")) {
							res.setHeader(
								"Cache-Control",
								"public, max-age=31536000, immutable",
							);
						}
						next();
					});
				},
			},
			{
				// Wraps CSS modules in a @layer so utilities always win and the higher of two modules
				// styling the same element wins regardless of chunk order: `elements` < `components`
				// < `features`. The layer order is prepended to each module because in Vite dev module
				// <style> tags are injected before global stylesheets.
				name: "css-modules-layer",
				enforce: "pre",
				transform(code, id) {
					if (!id.endsWith(".module.css")) return;
					const layerOrder =
						"@layer reset, base, elements, components, features, utilities;";
					const layer = cssModuleLayer(id);
					const magicCode = new MagicString(code);
					magicCode.prepend(`${layerOrder}\n@layer ${layer} {\n`);
					magicCode.append("\n}");

					return {
						code: magicCode.toString(),
						map: magicCode.generateMap({ source: id, hires: true }),
					};
				},
			},
			reactRouter(),
			// React Compiler is skipped in dev, its transform cost outweighs its value there
			...(isBuild
				? [
						babel({
							include: /\.[jt]sx?$/,
							babelConfig: {
								presets: ["@babel/preset-typescript"],
								plugins: [["babel-plugin-react-compiler", {}]],
							},
						}),
					]
				: []),
		],

		test: {
			globalSetup: ["./scripts/ensure-test-db.ts"],
			projects: [
				"./vitest.unit.config.ts",
				"./vitest.browser.config.ts",
				"./vitest.scanner.config.ts",
			],
		},
		define: {
			__GIT_COMMIT__: JSON.stringify(process.env.RENDER_GIT_COMMIT ?? ""),
		},
		build: {
			assetsInlineLimit: (filePath: string) => {
				if (/\/locales\/[^/]+\/[^/]+\.json$/.test(filePath)) return false;

				return undefined;
			},
		},
		resolve: {
			tsconfigPaths: true,
		},
		optimizeDeps: {
			// route-specific deps pre-bundled at startup to avoid mid-session re-optimization and full page reloads
			include: [
				"@date-fns/tz",
				"@techstark/opencv-js",
				"@dnd-kit/core",
				"@dnd-kit/modifiers",
				"@dnd-kit/sortable",
				"@dnd-kit/utilities",
				"@epic-web/cachified",
				"@internationalized/date",
				"@tldraw/tldraw",
				"@zumer/snapdom",
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
				"fflate",
				"i18next-browser-languagedetector",
				"i18next-http-backend",
				"kysely",
				"markdown-to-jsx",
				"mediabunny",
				"nanoid",
				"openskill",
				"picocad2-web",
				"qrcode.react",
				"react-chartjs-2",
				"react-flip-toolkit",
				"react-use-draggable-scroll",
				"remeda",
				"remix-auth",
				"remix-auth-oauth2",
				"remix-i18next",
				"sql-formatter",
				"swr/immutable",
				"valibot",
				"web-haptics/react",
			],
		},
	};
});

function cssModuleLayer(id: string) {
	if (id.includes("/app/components/elements/")) return "elements";
	if (/\/app\/components\/[^/]+\.module\.css$/.test(id)) return "components";

	return "features";
}
