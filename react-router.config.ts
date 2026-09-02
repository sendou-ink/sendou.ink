import type { Config } from "@react-router/dev/config";

export default {
	// lazy discovery would add server load; matches old Remix v2 behavior
	routeDiscovery: { mode: "initial" },
	splitRouteModules: true,
} satisfies Config;
