import { createCookieSessionStorage } from "react-router";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import type { Theme } from "./provider";
import { isTheme } from "./provider";

const TEN_YEARS_IN_SECONDS = 315_360_000;

const themeStorage = createCookieSessionStorage({
	cookie: {
		name: "theme",
		secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
		secrets: [ServerConfig.sessionSecret],
		sameSite: "lax",
		path: "/",
		httpOnly: true,
		maxAge: TEN_YEARS_IN_SECONDS,
	},
});

async function getThemeSession(request: Request) {
	const session = await themeStorage.getSession(request.headers.get("Cookie"));
	return {
		getTheme: () => {
			const themeValue = session.get("theme");
			return isTheme(themeValue) ? themeValue : null;
		},
		setTheme: (theme: Theme) => session.set("theme", theme),
		commit: () => themeStorage.commitSession(session),
		destroy: () => themeStorage.destroySession(session, { maxAge: 0 }),
	};
}

export { getThemeSession };
