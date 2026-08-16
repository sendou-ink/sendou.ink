import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

/**
 * Server (`process.env`) configuration. Import with
 * `import { ServerConfig } from "#lib/server/config.ts"` and read values like
 * `ServerConfig.dbPath`.
 *
 * Values are validated once when this module is first imported. Variables
 * required in production fall back to development defaults outside of
 * production.
 */

const isProd = process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN;

const TRUTHY_STRINGS = ["true", "1", "yes", "on", "y", "enabled"];
const FALSY_STRINGS = ["false", "0", "no", "off", "n", "disabled"];

const issues: Array<{ name: string; message: string }> = [];

const values = {
	NODE_ENV: process.env.NODE_ENV ?? "development",
	DB_PATH: requiredInProd("DB_PATH", "db.sqlite3"),
	SESSION_SECRET: requiredInProd("SESSION_SECRET", "secret"),
	SQL_LOG: oneOf("SQL_LOG", ["none", "trunc", "full"] as const, "none"),
	DISABLE_CACHE: stringBool("DISABLE_CACHE"),
};

if (issues.length > 0) {
	throw envError(issues);
}

export const ServerConfig = {
	/**
	 * Whether `NODE_ENV` is `"production"`. Note: this is `true` during e2e tests
	 * (which run a production build), so combine it with `IS_E2E_TEST_RUN` when
	 * you specifically need to exclude the e2e environment (as the session
	 * cookies do).
	 */
	isProduction: values.NODE_ENV === "production",
	/** Whether the app is running under the test runner. */
	isTest: values.NODE_ENV === "test",

	/** Path to the SQLite database file. */
	dbPath: values.DB_PATH,
	/** Secret used to sign session cookies. */
	sessionSecret: values.SESSION_SECRET,
	/** SQL query logging level. */
	sqlLog: values.SQL_LOG,
	/** Whether response caching is disabled. */
	disableCache: values.DISABLE_CACHE,
};

function requiredInProd(name: string, devFallback: string): string {
	const value = process.env[name];

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

function oneOf<T extends string>(
	name: string,
	options: readonly T[],
	defaultValue: T,
): T {
	const value = process.env[name];
	if (value === undefined) return defaultValue;
	if ((options as readonly string[]).includes(value)) return value as T;

	issues.push({
		name,
		message: `must be one of ${options.join(", ")}, got "${value}"`,
	});
	return defaultValue;
}

function stringBool(name: string): boolean {
	const value = process.env[name];
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
		`Invalid server environment configuration:\n${lines.join(
			"\n",
		)}\n\nSee .env.example for the full list of variables and how to set them.`,
	);
}
