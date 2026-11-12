import path from "node:path";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { hoverOnlyOnHoverDevices } from "../vite-css-plugins.ts";

const IS_E2E_BUILD = process.env.VITE_E2E_TEST_RUN === "true";

const reactApp = (file: string) =>
	path.resolve(import.meta.dirname, "../app", file);
const shim = (file: string) =>
	path.resolve(import.meta.dirname, "src/lib/server/shims", file);

export default defineConfig({
	// both apps must bake identical VITE_* values, the repo root .env is the single source of truth
	envDir: "..",
	define: {
		__GIT_COMMIT__: JSON.stringify(process.env.RENDER_GIT_COMMIT ?? ""),
	},
	resolve: {
		alias: [
			// shared server code reads the acting user through this module; here it is backed by the SvelteKit request event
			{
				find: /^~\/features\/auth\/core\/user\.server$/,
				replacement: shim("user.server.ts"),
			},
			{
				find: /^~\/features\/dev-tools\/dev-tools-server-hooks\.server$/,
				replacement: reactApp(
					"features/dev-tools/dev-tools-server-hooks.stub.ts",
				),
			},
			{ find: /^~\//, replacement: `${reactApp("")}/` },
		],
	},
	server: {
		fs: { allow: [".."] },
	},
	build: {
		// scripts/measure.ts attributes the bundle's bytes to their source modules
		sourcemap: process.env.SVELTE_SLICE_SOURCEMAP === "true" ? "hidden" : false,
	},
	css: {
		postcss: {
			plugins: [hoverOnlyOnHoverDevices()],
		},
	},
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			// the locale is resolved in hooks (same cookie and Accept-Language rules as the React app)
			strategy: ["globalVariable", "baseLocale"],
		}),
		sveltekit({
			adapter: adapter(),
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
			// one e2e build serves many worker ports over plain http
			...(IS_E2E_BUILD ? { csrf: { trustedOrigins: ["*"] } } : {}),
		}),
	],
});
