import { createCookieSessionStorage } from "@remix-run/node";

import invariant from "~/utils/invariant";
import { isTheme } from "./provider";
import type { Theme } from "./provider";

const TEN_YEARS_IN_SECONDS = 315_360_000;

if (process.env.NODE_ENV === "production") {
	invariant(process.env.SESSION_SECRET, "SESSION_SECRET is required");
}
const sessionSecret = process.env.SESSION_SECRET ?? "secret";

const themeStorage = createCookieSessionStorage({
	cookie: {
		name: "theme",
		secure: process.env.NODE_ENV === "production",
		secrets: [sessionSecret],
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
