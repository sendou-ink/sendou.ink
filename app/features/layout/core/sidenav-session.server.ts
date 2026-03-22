import { createCookieSessionStorage } from "react-router";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";

const TEN_YEARS_IN_SECONDS = 315_360_000;

if (process.env.NODE_ENV === "production") {
	invariant(process.env.SESSION_SECRET, "SESSION_SECRET is required");
}
const sessionSecret = process.env.SESSION_SECRET ?? "secret";

const sidenavStorage = createCookieSessionStorage({
	cookie: {
		name: "sidenav",
		secure: process.env.NODE_ENV === "production" && !IS_E2E_TEST_RUN,
		secrets: [sessionSecret],
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
