import * as v from "valibot";
import { envBoolean, formatEnvErrors, requiredInProd } from "./config-helpers";
import { IS_E2E_TEST_RUN } from "./utils/e2e";

/**
 * Client (`VITE_*`) configuration. Import with `import { Config } from "~/config"`
 * and read values like `Config.siteDomain` or `Config.skalop.wsUrl`.
 *
 * Values are validated once when this module is first imported, surfacing a
 * single clear error for any misconfigured variable. Variables required in
 * production fall back to development defaults outside of production.
 */

// `import.meta.env` is undefined when Playwright bundles test code, so guard the
// access and treat that environment as non-production (see `~/utils/e2e`).
const env =
	typeof import.meta.env !== "undefined"
		? (import.meta.env as Record<string, string | undefined>)
		: {};

const isProd =
	typeof import.meta.env !== "undefined" &&
	import.meta.env.PROD === true &&
	!IS_E2E_TEST_RUN;

const schema = v.object({
	VITE_SITE_DOMAIN: requiredInProd(isProd, "http://localhost:5173"),
	VITE_TOURNAMENT_DEFAULT_LOGO: requiredInProd(
		isProd,
		"tournament-logo-default.avif",
	),
	VITE_STATIC_ASSETS_URL: v.optional(
		v.string(),
		"https://sendou-assets.nyc3.cdn.digitaloceanspaces.com",
	),

	VITE_PROD_MODE: v.optional(envBoolean, "false"),
	VITE_SHOW_LUTI_NAV_ITEM: v.optional(envBoolean, "false"),
	VITE_FUSE_ENABLED: v.optional(envBoolean, "false"),
	VITE_SCANNER_ENABLED: v.optional(envBoolean, "false"),

	VITE_LEAGUE_GOOGLE_FORM_URL: v.optional(v.string()),
	VITE_SHOW_BANNER_FOR_SEASON: v.optional(v.string()),
	VITE_SKALOP_WS_URL: v.optional(v.string()),

	// The VAPID private key and email live in `~/config.server` since they are
	// server-only; the full three-var coupling is completed by the runtime check
	// in webPush.server.ts.
	VITE_VAPID_PUBLIC_KEY: v.optional(v.string()),
});

const parsed = v.safeParse(schema, env);
if (!parsed.success) {
	throw formatEnvErrors("client", parsed.issues);
}
const values = parsed.output;

export const Config = {
	/** Base URL of the site, e.g. `https://sendou.ink`. */
	siteDomain: values.VITE_SITE_DOMAIN,
	/** Filename of the default tournament logo asset. */
	tournamentDefaultLogo: values.VITE_TOURNAMENT_DEFAULT_LOGO,
	/** Base URL for static assets (images, sounds, svg). */
	staticAssetsUrl: values.VITE_STATIC_ASSETS_URL,
	/** Whether to use real seasons & league data (used when developing against the production database). */
	prodMode: values.VITE_PROD_MODE,
	/** Whether to show the LUTI navigation item. */
	showLutiNavItem: values.VITE_SHOW_LUTI_NAV_ITEM,
	fuseEnabled: values.VITE_FUSE_ENABLED,
	/** Whether the scanner is available to everyone. While false only the admin and devs can use the scanner page and its ingest endpoint. */
	scannerEnabled: values.VITE_SCANNER_ENABLED,
	/** Google Form URL for league registration, if configured. */
	leagueGoogleFormUrl: values.VITE_LEAGUE_GOOGLE_FORM_URL,
	/** Season identifier to show the registration banner for, if any. */
	showBannerForSeason: values.VITE_SHOW_BANNER_FOR_SEASON,
	/** Skalop (chat) client configuration. */
	skalop: {
		wsUrl: values.VITE_SKALOP_WS_URL,
	},
	/** Web push (VAPID) client configuration. */
	vapid: {
		publicKey: values.VITE_VAPID_PUBLIC_KEY,
	},
};
