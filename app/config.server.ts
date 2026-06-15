import { z } from "zod";
import { formatEnvErrors, requiredInProd } from "./config-helpers";
import { IS_E2E_TEST_RUN } from "./utils/e2e";

/**
 * Server (`process.env`) configuration. Import with
 * `import { ServerConfig } from "~/config.server"` and read values like
 * `ServerConfig.dbPath` or `ServerConfig.storage.endpoint`.
 *
 * Values are validated once when this module is first imported, surfacing a
 * single clear error for any misconfigured variable. Variables required in
 * production fall back to development defaults outside of production.
 */

const isProd = process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN;

const schema = z
	.object({
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		DB_PATH: requiredInProd(isProd, "db.sqlite3"),
		SESSION_SECRET: requiredInProd(isProd, "secret"),
		LOHI_TOKEN: requiredInProd(isProd, "salmon"),
		SQL_LOG: z.enum(["none", "trunc", "full"]).default("none"),
		DISABLE_CACHE: z.stringbool().default(false),

		DISCORD_CLIENT_ID: requiredInProd(isProd, ""),
		DISCORD_CLIENT_SECRET: requiredInProd(isProd, ""),

		STORAGE_END_POINT: requiredInProd(isProd, "http://127.0.0.1:9000"),
		STORAGE_ACCESS_KEY: requiredInProd(isProd, "minio-user"),
		STORAGE_SECRET: requiredInProd(isProd, "minio-password"),
		STORAGE_REGION: requiredInProd(isProd, "us-east-1"),
		STORAGE_BUCKET: requiredInProd(isProd, "sendou"),

		SKALOP_SYSTEM_MESSAGE_URL: z.string().optional(),
		SKALOP_TOKEN: z.string().optional(),

		TWITCH_CLIENT_ID: z.string().optional(),
		TWITCH_CLIENT_SECRET: z.string().optional(),

		PATREON_ACCESS_TOKEN: z.string().optional(),

		// The VAPID public key (VITE_VAPID_PUBLIC_KEY) lives in `~/config` since
		// it is client-readable; the full three-var coupling is completed by the
		// runtime check in webPush.server.ts.
		VAPID_PRIVATE_KEY: z.string().optional(),
		VAPID_EMAIL: z.string().optional(),
	})
	.superRefine((val, ctx) => {
		requireTogether(ctx, val, "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET");
		requireTogether(ctx, val, "VAPID_EMAIL", "VAPID_PRIVATE_KEY");
	});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
	throw formatEnvErrors("server", parsed.error);
}
const values = parsed.data;

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
	/** Token authorizing internal Lohi (bot/cron) requests. */
	lohiToken: values.LOHI_TOKEN,
	/** SQL query logging level. */
	sqlLog: values.SQL_LOG,
	/** Whether response caching is disabled. */
	disableCache: values.DISABLE_CACHE,

	/** Discord OAuth configuration. */
	discord: {
		clientId: values.DISCORD_CLIENT_ID,
		clientSecret: values.DISCORD_CLIENT_SECRET,
	},

	/** S3-compatible object storage configuration. */
	storage: {
		endpoint: values.STORAGE_END_POINT,
		accessKey: values.STORAGE_ACCESS_KEY,
		secret: values.STORAGE_SECRET,
		region: values.STORAGE_REGION,
		bucket: values.STORAGE_BUCKET,
	},

	/** Skalop (chat) server configuration. Optional — chat features no-op when unset. */
	skalop: {
		systemMessageUrl: values.SKALOP_SYSTEM_MESSAGE_URL,
		token: values.SKALOP_TOKEN,
	},

	/** Twitch integration credentials. Optional — streams are hidden when unset. */
	twitch: {
		clientId: values.TWITCH_CLIENT_ID,
		clientSecret: values.TWITCH_CLIENT_SECRET,
	},

	/** Patreon integration configuration. */
	patreon: {
		accessToken: values.PATREON_ACCESS_TOKEN,
	},

	/** Web push (VAPID) server configuration. */
	vapid: {
		privateKey: values.VAPID_PRIVATE_KEY,
		email: values.VAPID_EMAIL,
	},
};

/** Adds a validation issue unless `a` and `b` are both set or both unset. */
function requireTogether(
	ctx: z.RefinementCtx,
	values: Record<string, unknown>,
	a: string,
	b: string,
) {
	const aSet = Boolean(values[a]);
	const bSet = Boolean(values[b]);
	if (aSet === bSet) return;

	const present = aSet ? a : b;
	const missing = aSet ? b : a;
	ctx.addIssue({
		code: "custom",
		path: [missing],
		message: `must be set together with ${present}`,
	});
}
