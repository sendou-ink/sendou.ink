import { createCookieSessionStorage } from "react-router";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";

const ONE_YEAR_IN_SECONDS = 31_536_000;

if (process.env.NODE_ENV === "production") {
	invariant(process.env.SESSION_SECRET, "SESSION_SECRET is required");
}
export const authSessionStorage = createCookieSessionStorage({
	cookie: {
		name: "__session",
		sameSite: "lax",
		// need to specify domain so that sub-domains can access it
		domain:
			process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN
				? "sendou.ink"
				: undefined,
		path: "/",
		httpOnly: true,
		secrets: [process.env.SESSION_SECRET ?? "secret"],
		secure: process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN,
		maxAge: ONE_YEAR_IN_SECONDS,
	},
});
