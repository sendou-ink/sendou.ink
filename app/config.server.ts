import * as v from "valibot";
import { envBoolean, formatEnvErrors, requiredInProd } from "./config-helpers";
import { IS_E2E_TEST_RUN } from "./utils/e2e";
import { superRefine, type ValidationCtx } from "./utils/schema";

/**
 * Server (`process.env`) configuration, validated once on first import. Variables required in
 * production fall back to development defaults elsewhere.
 */

const isProd = process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN;

const schema = v.pipe(
	v.object({
		NODE_ENV: v.optional(
			v.picklist(["development", "production", "test"]),
			"development",
		),
		DB_PATH: requiredInProd(isProd, "db.sqlite3"),
		SESSION_SECRET: requiredInProd(isProd, "secret"),
		LOHI_TOKEN: requiredInProd(isProd, "salmon"),
		SQL_LOG: v.optional(v.picklist(["none", "trunc", "full"]), "none"),
		DISABLE_CACHE: v.optional(envBoolean, "false"),

		DISCORD_CLIENT_ID: requiredInProd(isProd, ""),
		DISCORD_CLIENT_SECRET: requiredInProd(isProd, ""),

		STORAGE_END_POINT: requiredInProd(isProd, "http://127.0.0.1:9000"),
		STORAGE_ACCESS_KEY: requiredInProd(isProd, "minio-user"),
		STORAGE_SECRET: requiredInProd(isProd, "minio-password"),
		STORAGE_REGION: requiredInProd(isProd, "us-east-1"),
		STORAGE_BUCKET: requiredInProd(isProd, "sendou"),

		TWITCH_CLIENT_ID: v.optional(v.string()),
		TWITCH_CLIENT_SECRET: v.optional(v.string()),

		PATREON_ACCESS_TOKEN: v.optional(v.string()),

		// the client-readable public key (VITE_VAPID_PUBLIC_KEY) lives in `~/config`;
		// webPush.server.ts checks all three are set together
		VAPID_PRIVATE_KEY: v.optional(v.string()),
		VAPID_EMAIL: v.optional(v.string()),
	}),
	superRefine((val, ctx) => {
		requireTogether(ctx, val, "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET");
		requireTogether(ctx, val, "VAPID_EMAIL", "VAPID_PRIVATE_KEY");
	}),
);

const parsed = v.safeParse(schema, process.env);
if (!parsed.success) {
	throw formatEnvErrors("server", parsed.issues);
}
const values = parsed.output;

export const ServerConfig = {
	/** Also `true` during e2e tests (production build); combine with `IS_E2E_TEST_RUN` to exclude them. */
	isProduction: values.NODE_ENV === "production",
	isTest: values.NODE_ENV === "test",

	dbPath: values.DB_PATH,
	sessionSecret: values.SESSION_SECRET,
	/** Authorizes internal Lohi (bot/cron) requests. */
	lohiToken: values.LOHI_TOKEN,
	sqlLog: values.SQL_LOG,
	disableCache: values.DISABLE_CACHE,

	discord: {
		clientId: values.DISCORD_CLIENT_ID,
		clientSecret: values.DISCORD_CLIENT_SECRET,
	},

	/** S3-compatible object storage */
	storage: {
		endpoint: values.STORAGE_END_POINT,
		accessKey: values.STORAGE_ACCESS_KEY,
		secret: values.STORAGE_SECRET,
		region: values.STORAGE_REGION,
		bucket: values.STORAGE_BUCKET,
	},

	/** Optional, streams are hidden when unset. */
	twitch: {
		clientId: values.TWITCH_CLIENT_ID,
		clientSecret: values.TWITCH_CLIENT_SECRET,
	},

	patreon: {
		accessToken: values.PATREON_ACCESS_TOKEN,
	},

	/** web push */
	vapid: {
		privateKey: values.VAPID_PRIVATE_KEY,
		email: values.VAPID_EMAIL,
	},
};

/** Adds a validation issue unless `a` and `b` are both set or both unset. */
function requireTogether(
	ctx: ValidationCtx,
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
		path: [missing],
		message: `must be set together with ${present}`,
	});
}
