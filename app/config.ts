import * as v from "valibot";
import { envBoolean, formatEnvErrors, requiredInProd } from "./config-helpers";
import { IS_E2E_TEST_RUN } from "./utils/e2e";

/**
 * Client (`VITE_*`) configuration, validated once on first import. Variables required in
 * production fall back to development defaults elsewhere.
 */

// `import.meta.env` is undefined when Playwright bundles test code; treat that as non-production (see `~/utils/e2e`)
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

	// the server-only private key and email live in `~/config.server`;
	// webPush.server.ts checks all three are set together
	VITE_VAPID_PUBLIC_KEY: v.optional(v.string()),
});

const parsed = v.safeParse(schema, env);
if (!parsed.success) {
	throw formatEnvErrors("client", parsed.issues);
}
const values = parsed.output;

export const Config = {
	/** e.g. `https://sendou.ink` */
	siteDomain: values.VITE_SITE_DOMAIN,
	tournamentDefaultLogo: values.VITE_TOURNAMENT_DEFAULT_LOGO,
	staticAssetsUrl: values.VITE_STATIC_ASSETS_URL,
	/** Use real seasons & league data (when developing against the production database). */
	prodMode: values.VITE_PROD_MODE,
	showLutiNavItem: values.VITE_SHOW_LUTI_NAV_ITEM,
	fuseEnabled: values.VITE_FUSE_ENABLED,
	/** While false only the admin and devs can use the scanner page and its ingest endpoint. */
	scannerEnabled: values.VITE_SCANNER_ENABLED,
	leagueGoogleFormUrl: values.VITE_LEAGUE_GOOGLE_FORM_URL,
	/** Season to show the registration banner for. */
	showBannerForSeason: values.VITE_SHOW_BANNER_FOR_SEASON,
	/** web push */
	vapid: {
		publicKey: values.VITE_VAPID_PUBLIC_KEY,
	},
};
