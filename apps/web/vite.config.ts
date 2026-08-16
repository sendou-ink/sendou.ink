import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	define: {
		__GIT_COMMIT__: JSON.stringify(process.env.RENDER_GIT_COMMIT ?? ""),
	},
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			strategy: ["cookie", "preferredLanguage", "baseLocale"],
			outputStructure:
				mode === "production" ? "message-modules" : "locale-modules",
		}),
		sveltekit({
			adapter: adapter(),
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
	},
}));
