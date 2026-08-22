import type { Config } from "@react-router/dev/config";

export default {
	// Fog of war: inlines only the matched routes' manifest (~13KB) instead of the
	// full-route-tree manifest asset (~400KB at the time of writing) every page load
	routeDiscovery: { mode: "lazy" },
	splitRouteModules: true,
} satisfies Config;
