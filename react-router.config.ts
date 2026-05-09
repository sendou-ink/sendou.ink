import type { Config } from "@react-router/dev/config";
import { sentryOnBuildEnd } from "@sentry/react-router";

export default {
	// Upfront cost vs. lazy loading trade-off
	// also lazy loading causes more load on the server
	// this matches old Remix v2 behavior
	routeDiscovery: { mode: "initial" },
	future: {
		v8_middleware: true,
	},
	buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
		await sentryOnBuildEnd({
			viteConfig: viteConfig,
			reactRouterConfig: reactRouterConfig,
			buildManifest: buildManifest,
		});
	},
} satisfies Config;
