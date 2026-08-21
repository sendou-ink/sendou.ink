import * as v from "valibot";

const TRUTHY_ENV_VALUES = ["true", "1", "yes", "on", "y", "enabled"];
const FALSY_ENV_VALUES = ["false", "0", "no", "off", "n", "disabled"];

/**
 * Builds an `Error` with a readable, multi-line message describing every invalid
 * environment variable. Schemas are keyed by the literal env var name so the
 * issue path points straight at the variable a contributor needs to fix.
 */
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
 * String schema that must be set to a non-empty value in production, but falls
 * back to `devFallback` outside of production so contributors can run the app
 * without configuring every integration.
 */
export function requiredInProd(isProd: boolean, devFallback: string) {
	// The production branch defaults to `""` rather than being required outright
	// so that a missing variable reaches `minLength` and reports the same
	// actionable message an empty one does, instead of valibot's "Invalid key".
	return isProd
		? v.pipe(
				v.optional(v.string(), ""),
				v.minLength(1, "required in production"),
			)
		: v.optional(v.string(), devFallback);
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
