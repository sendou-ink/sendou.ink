import type { Config } from "@react-router/dev/config";
import { sentryOnBuildEnd } from "@sentry/react-router";

export default {
	// Upfront cost vs. lazy loading trade-off
	// also lazy loading causes more load on the server
	// this matches old Remix v2 behavior
	routeDiscovery: { mode: "initial" },
	future: {
		v8_middleware: true,
		v8_splitRouteModules: true,
		// Disabled: passing the raw request makes relative redirects (e.g. the
		// successToast/errorToast `redirect("?__success=...")` pattern) resolve
		// against the `.data` URL of single-fetch requests, breaking navigation.
		v8_passThroughRequests: false,
		v8_trailingSlashAwareDataRequests: true,
		v8_viteEnvironmentApi: true,
	},
	buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
		await sentryOnBuildEnd({
			viteConfig: viteConfig,
			reactRouterConfig: reactRouterConfig,
			buildManifest: buildManifest,
		});
	},
} satisfies Config;
