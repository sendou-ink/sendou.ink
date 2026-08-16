import { createCookieSessionStorage } from "react-router";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

const TEN_YEARS_IN_SECONDS = 315_360_000;

const sidenavStorage = createCookieSessionStorage({
	cookie: {
		name: "sidenav",
		secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
		secrets: [ServerConfig.sessionSecret],
		sameSite: "lax",
		path: "/",
		httpOnly: true,
		maxAge: TEN_YEARS_IN_SECONDS,
	},
});

export async function getSidenavSession(request: Request) {
	const session = await sidenavStorage.getSession(
		request.headers.get("Cookie"),
	);
	return {
		getCollapsed: () => session.get("collapsed") === true,
		setCollapsed: (collapsed: boolean) => session.set("collapsed", collapsed),
		commit: () => sidenavStorage.commitSession(session),
	};
}
