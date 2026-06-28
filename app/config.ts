import { z } from "zod";
import { formatEnvErrors, requiredInProd } from "./config-helpers";
import { IS_E2E_TEST_RUN } from "./utils/e2e";

/**
 * Client (`VITE_*`) configuration. Import with `import { Config } from "~/config"`
 * and read values like `Config.siteDomain` or `Config.sentry.enabled`.
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

const schema = z.object({
	VITE_SITE_DOMAIN: requiredInProd(isProd, "http://localhost:5173"),
	VITE_TOURNAMENT_DEFAULT_LOGO: requiredInProd(
		isProd,
		"tournament-logo-default.avif",
	),
	VITE_STATIC_ASSETS_URL: z
		.string()
		.default("https://sendou-assets.nyc3.cdn.digitaloceanspaces.com"),
	VITE_PROD_MODE: z.stringbool().default(false),
	VITE_SHOW_LUTI_NAV_ITEM: z.stringbool().default(false),
	VITE_FUSE_ENABLED: z.stringbool().default(false),
	VITE_LEAGUE_GOOGLE_FORM_URL: z.string().optional(),
	VITE_SHOW_BANNER_FOR_SEASON: z.string().optional(),
	VITE_SENTRY_DSN: z.string().optional(),
	VITE_SENTRY_ENABLED: z.stringbool().default(false),
	VITE_SKALOP_WS_URL: z.string().optional(),
	VITE_VAPID_PUBLIC_KEY: z.string().optional(),
});

const parsed = schema.safeParse(env);
if (!parsed.success) {
	throw formatEnvErrors("client", parsed.error);
}
const values = parsed.data;

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
	/** Google Form URL for league registration, if configured. */
	leagueGoogleFormUrl: values.VITE_LEAGUE_GOOGLE_FORM_URL,
	/** Season identifier to show the registration banner for, if any. */
	showBannerForSeason: values.VITE_SHOW_BANNER_FOR_SEASON,
	/** Sentry client configuration. */
	sentry: {
		dsn: values.VITE_SENTRY_DSN,
		enabled: values.VITE_SENTRY_ENABLED,
	},
	/** Skalop (chat) client configuration. */
	skalop: {
		wsUrl: values.VITE_SKALOP_WS_URL,
	},
	/** Web push (VAPID) client configuration. */
	vapid: {
		publicKey: values.VITE_VAPID_PUBLIC_KEY,
	},
};
