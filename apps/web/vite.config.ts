import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const IS_E2E_BUILD = process.env.VITE_E2E_TEST_RUN === "true";

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
			// e2e/differ tooling POSTs (impersonate, theme) carry no Origin header,
			// and the adapter guesses https:// when no proxy headers are present, so
			// origin checks can never pass against the http test servers
			...(IS_E2E_BUILD
				? {
						csrf: { trustedOrigins: ["*"] },
						paths: { origin: process.env.VITE_SITE_DOMAIN },
					}
				: {}),
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
	},
}));
