import { z } from "zod";

/**
 * Builds an `Error` with a readable, multi-line message describing every invalid
 * environment variable. Schemas are keyed by the literal env var name so the
 * issue path points straight at the variable a contributor needs to fix.
 */
export function formatEnvErrors(
	scope: "client" | "server",
	error: z.ZodError,
): Error {
	const lines = error.issues.map((issue) => {
		const name = issue.path.join(".") || "(unknown)";
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
	return isProd
		? z.string({ message: "required in production" }).min(1, {
				message: "required in production (cannot be empty)",
			})
		: z.string().default(devFallback);
}
