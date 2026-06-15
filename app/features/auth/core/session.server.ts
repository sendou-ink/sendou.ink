import { createCookieSessionStorage } from "react-router";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

const ONE_YEAR_IN_SECONDS = 31_536_000;

export const authSessionStorage = createCookieSessionStorage({
	cookie: {
		name: "__session",
		sameSite: "lax",
		// need to specify domain so that sub-domains can access it
		domain:
			ServerConfig.isProduction && !IS_E2E_TEST_RUN ? "sendou.ink" : undefined,
		path: "/",
		httpOnly: true,
		secrets: [ServerConfig.sessionSecret],
		secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
		maxAge: ONE_YEAR_IN_SECONDS,
	},
});
