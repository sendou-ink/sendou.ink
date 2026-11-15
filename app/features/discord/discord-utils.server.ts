import { createCookie } from "react-router";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

/** Discord linked role security state cookie to validate identity during the redirect */
export const clientStateCookie = createCookie("clientState", {
	maxAge: 60 * 5,
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	secrets: [ServerConfig.sessionSecret],
	secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
});
