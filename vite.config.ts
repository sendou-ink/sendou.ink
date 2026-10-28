import fs from "node:fs";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import babel from "vite-plugin-babel";
import {
	cssModulesLayer,
	hoverOnlyOnHoverDevices,
} from "./vite-css-plugins.ts";

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
			// the docs site has a dev server of its own, its builds and caches would reload the app
			watch: { ignored: ["**/docs/**"] },
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
			cssModulesLayer(),
			reactRouter(),
			eagerlyCompileSharedChunks(),
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

		css: {
			postcss: {
				plugins: [hoverOnlyOnHoverDevices()],
			},
		},
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
			// keeps every dev tools module out of production builds, the stub's hooks are `null`
			alias: isBuild
				? [
						{
							find: /^~\/features\/dev-tools\/dev-tools-server-hooks\.server$/,
							replacement: path.resolve(
								"app/features/dev-tools/dev-tools-server-hooks.stub.ts",
							),
						},
					]
				: [],
		},
		optimizeDeps: {
			// route-specific deps pre-bundled at startup to avoid mid-session re-optimization and full page reloads
			include: [
				"@aws-sdk/client-s3",
				"@aws-sdk/lib-storage",
				"@date-fns/tz",
				"@techstark/opencv-js",
				"@dnd-kit/core",
				"@dnd-kit/modifiers",
				"@dnd-kit/sortable",
				"@dnd-kit/utilities",
				"@epic-web/cachified",
				"@react-router/node",
				"@tldraw/tldraw",
				"@zumer/snapdom",
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
				"gray-matter",
				"kysely",
				"markdown-to-jsx",
				"mediabunny",
				"nanoid",
				"openskill",
				"p-limit",
				"picocad2-web",
				"qrcode.react",
				"remeda",
				"remix-auth",
				"remix-auth-oauth2",
				"sql-formatter",
				"swr/immutable",
				"valibot",
				"web-haptics/react",
				"web-push",
			],
		},
	};
});

const COMPILE_HINT = "//# allFunctionsCalledOnLoad\n";

/**
 * Marks the chunks every page loads (the static import graph of the client entry and the root
 * route) with V8's explicit compile hint, so Chromium compiles them on a background thread while
 * streaming instead of lazily on the main thread during hydration. Route chunks are left out: only
 * a fraction of their functions run on load and eager compiling costs memory.
 * See https://v8.dev/blog/explicit-compile-hints
 */
function eagerlyCompileSharedChunks(): Plugin {
	return {
		name: "eagerly-compile-shared-chunks",
		apply: "build",
		// on the written files: Vite prepends its preload helper to chunks after `generateBundle`
		// and the hint only counts on the first line
		writeBundle(options, bundle) {
			const chunks = Object.values(bundle).filter(
				(output) => output.type === "chunk",
			);
			const chunksByFileName = new Map(
				chunks.map((chunk) => [chunk.fileName, chunk]),
			);
			const chunkOf = (modulePath: string) =>
				chunks.find((chunk) =>
					chunk.facadeModuleId?.split("?")[0].endsWith(modulePath),
				);
			const entryChunk = chunkOf("/app/entry.client.tsx");
			const rootChunk = chunkOf("/app/root.tsx");
			// the server build has no client entry
			if (!entryChunk || !rootChunk) return;

			const visited = new Set<string>();
			const stack = [entryChunk.fileName, rootChunk.fileName];
			for (let fileName = stack.pop(); fileName; fileName = stack.pop()) {
				const chunk = chunksByFileName.get(fileName);
				if (!chunk || visited.has(fileName)) continue;

				visited.add(fileName);
				const filePath = path.join(options.dir ?? "", fileName);
				fs.writeFileSync(
					filePath,
					COMPILE_HINT + fs.readFileSync(filePath, "utf8"),
				);
				stack.push(...chunk.imports);
			}
		},
	};
}
