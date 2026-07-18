import { IS_E2E_TEST_RUN } from "./utils/e2e";

/**
 * Client (`VITE_*`) configuration. Import with `import { Config } from "~/config"`
 * and read values like `Config.siteDomain` or `Config.sentry.enabled`.
 *
 * Values are validated once when this module is first imported, surfacing a
 * single clear error for any misconfigured variable. Variables required in
 * production fall back to development defaults outside of production.
 *
 * Note: this module ships in the critical client bundle so it must stay free of
 * heavy dependencies (e.g. zod, which the server config uses).
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

const TRUTHY_STRINGS = ["true", "1", "yes", "on", "y", "enabled"];
const FALSY_STRINGS = ["false", "0", "no", "off", "n", "disabled"];

const issues: Array<{ name: string; message: string }> = [];

const values = {
	VITE_SITE_DOMAIN: requiredInProd("VITE_SITE_DOMAIN", "http://localhost:5173"),
	VITE_TOURNAMENT_DEFAULT_LOGO: requiredInProd(
		"VITE_TOURNAMENT_DEFAULT_LOGO",
		"tournament-logo-default.avif",
	),
	VITE_STATIC_ASSETS_URL: withDefault(
		"VITE_STATIC_ASSETS_URL",
		"https://sendou-assets.nyc3.cdn.digitaloceanspaces.com",
	),
	VITE_PROD_MODE: stringBool("VITE_PROD_MODE"),
	VITE_SHOW_LUTI_NAV_ITEM: stringBool("VITE_SHOW_LUTI_NAV_ITEM"),
	VITE_FUSE_ENABLED: stringBool("VITE_FUSE_ENABLED"),
	VITE_LEAGUE_GOOGLE_FORM_URL: env.VITE_LEAGUE_GOOGLE_FORM_URL,
	VITE_SHOW_BANNER_FOR_SEASON: env.VITE_SHOW_BANNER_FOR_SEASON,
	VITE_SENTRY_DSN: env.VITE_SENTRY_DSN,
	VITE_SENTRY_ENABLED: stringBool("VITE_SENTRY_ENABLED"),
	VITE_SKALOP_WS_URL: env.VITE_SKALOP_WS_URL,
	VITE_VAPID_PUBLIC_KEY: env.VITE_VAPID_PUBLIC_KEY,
};

if (issues.length > 0) {
	throw envError(issues);
}

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

function requiredInProd(name: string, devFallback: string): string {
	const value = env[name];

	if (!isProd) {
		return value ?? devFallback;
	}

	if (value === undefined) {
		issues.push({ name, message: "required in production" });
		return "";
	}
	if (value.length === 0) {
		issues.push({ name, message: "required in production (cannot be empty)" });
		return "";
	}

	return value;
}

function withDefault(name: string, defaultValue: string): string {
	return env[name] ?? defaultValue;
}

function stringBool(name: string): boolean {
	const value = env[name];
	if (value === undefined) return false;

	const normalized = value.toLowerCase();
	if (TRUTHY_STRINGS.includes(normalized)) return true;
	if (FALSY_STRINGS.includes(normalized)) return false;

	issues.push({
		name,
		message: `must be a boolean-like string (e.g. "true" or "false"), got "${value}"`,
	});
	return false;
}

function envError(issues: Array<{ name: string; message: string }>): Error {
	const lines = issues.map((issue) => `  - ${issue.name}: ${issue.message}`);

	return new Error(
		`Invalid client environment configuration:\n${lines.join(
			"\n",
		)}\n\nSee .env.example for the full list of variables and how to set them.`,
	);
}
