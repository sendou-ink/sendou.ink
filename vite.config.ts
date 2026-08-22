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
				// Wraps CSS modules in a @layer so utility classes always win and, more
				// generally, so that the more specific of two modules styling the same
				// element wins no matter what order Vite happens to emit the chunks in:
				// `elements` (headless library wrappers) < `components` (shared
				// components) < `features` (feature code and composed component groups).
				// The layer order declaration is prepended to each module because in Vite
				// dev mode, module <style> tags are injected before global stylesheets —
				// without it the implicit first layer would get lowest priority.
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
			// React Compiler is skipped in dev where its per-module transform cost
			// outweighs its value.
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
			// Dependencies which are only imported by specific route modules.
			// Pre-bundling them at startup avoids mid-session re-optimization
			// and full page reloads on first navigations.
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
				"partysocket",
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
