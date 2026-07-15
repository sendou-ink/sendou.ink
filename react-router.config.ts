import type { Config } from "@react-router/dev/config";
import { sentryOnBuildEnd } from "@sentry/react-router";

// xxx: if we remove routeDiscovery, need to add caching in cloudflare
export default {
	splitRouteModules: true,
	buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
		await sentryOnBuildEnd({
			viteConfig: viteConfig,
			reactRouterConfig: reactRouterConfig,
			buildManifest: buildManifest,
		});
	},
} satisfies Config;
