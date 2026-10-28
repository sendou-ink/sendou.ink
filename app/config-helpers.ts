import * as v from "valibot";

const TRUTHY_ENV_VALUES = ["true", "1", "yes", "on", "y", "enabled"];
const FALSY_ENV_VALUES = ["false", "0", "no", "off", "n", "disabled"];

/** `Error` listing every invalid env var; issue paths are the literal variable names. */
export function formatEnvErrors(
	scope: "client" | "server",
	issues: readonly v.BaseIssue<unknown>[],
): Error {
	const lines = issues.map((issue) => {
		const name = issue.path?.map((item) => item.key).join(".") || "(unknown)";
		return `  - ${name}: ${issue.message}`;
	});

	return new Error(
		`Invalid ${scope} environment configuration:\n${lines.join(
			"\n",
		)}\n\nSee .env.example for the full list of variables and how to set them.`,
	);
}

/**
 * Non-empty string in production, `devFallback` elsewhere. With `rejectDevFallback` production
 * also refuses `devFallback` itself, for secrets whose development default is public.
 */
export function requiredInProd(
	isProd: boolean,
	devFallback: string,
	{ rejectDevFallback = false } = {},
) {
	// defaults to `""` so a missing variable reaches `minLength` and gets the same
	// actionable message as an empty one, instead of valibot's "Invalid key"
	return isProd
		? v.pipe(
				v.optional(v.string(), ""),
				v.minLength(1, "required in production"),
				v.check(
					(value) => !rejectDevFallback || value !== devFallback,
					"must not be the development default in production",
				),
			)
		: v.optional(v.string(), devFallback);
}

/**
 * Throws when the e2e flag is set in a production build served from anywhere but localhost: the
 * flag enables dev controls (seeding & user impersonation) and turns off production config
 * validation.
 */
export function assertE2EFlagSafe({
	nodeEnv,
	isE2E,
	siteDomain,
}: {
	nodeEnv: string | undefined;
	isE2E: boolean;
	siteDomain: string | undefined;
}) {
	if (nodeEnv !== "production" || !isE2E || isLocalhostUrl(siteDomain)) return;

	throw new Error(
		"VITE_E2E_TEST_RUN must not be set in production: it enables dev controls (seeding & user impersonation) and turns off production config validation. It is only allowed when VITE_SITE_DOMAIN is localhost.",
	);
}

/** Boolean parsed from a boolean-like string environment variable (e.g. `"true"`, `"0"`, `"on"`). */
export const envBoolean = v.pipe(
	v.string(),
	v.check(
		(value) => isTruthyEnvValue(value) || isFalsyEnvValue(value),
		'must be a boolean-like string (e.g. "true" or "false")',
	),
	v.transform(isTruthyEnvValue),
);

function isTruthyEnvValue(value: string) {
	return TRUTHY_ENV_VALUES.includes(value.toLowerCase());
}

function isFalsyEnvValue(value: string) {
	return FALSY_ENV_VALUES.includes(value.toLowerCase());
}

function isLocalhostUrl(url: string | undefined) {
	if (!url || !URL.canParse(url)) return false;

	return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
}
