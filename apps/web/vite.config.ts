import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const IS_E2E_BUILD = process.env.VITE_E2E_TEST_RUN === "true";

export default defineConfig(({ mode }) => ({
	// xxx: during the migration both apps must bake identical VITE_* values, and
	// apps/web-react/.env is the single source of truth for them
	envDir: "../web-react",
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
			// so the form CSRF check can never pass against the http test servers.
			// The per-server origin itself comes from adapter-node's ORIGIN env var
			// (one build serves many worker ports) — remote-function CSRF checks
			// ignore trustedOrigins and compare against that origin.
			...(IS_E2E_BUILD ? { csrf: { trustedOrigins: ["*"] } } : {}),
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
	},
}));
