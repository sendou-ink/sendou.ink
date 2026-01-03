import type { Config } from "@react-router/dev/config";

export default {
	// Upfront cost vs. lazy loading trade-off
	// also lazy loading causes more load on the server
	// this matches old Remix v2 behavior
	routeDiscovery: { mode: "initial" },
} satisfies Config;
