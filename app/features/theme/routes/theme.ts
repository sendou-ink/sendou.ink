import {
	type ActionFunction,
	type LoaderFunction,
	data,
	redirect,
} from "@remix-run/node";
import { isTheme } from "../core/provider";
import { getThemeSession } from "../core/session.server";

export const action: ActionFunction = async ({ request }) => {
	const themeSession = await getThemeSession(request);
	const requestText = await request.text();
	const form = new URLSearchParams(requestText);
	const theme = form.get("theme");

	if (theme === "auto") {
		return data(
			{ success: true },
			{ headers: { "Set-Cookie": await themeSession.destroy() } },
		);
	}

	if (!isTheme(theme)) {
		return {
			success: false,
			message: `theme value of ${theme ?? "null"} is not a valid theme`,
		};
	}

	themeSession.setTheme(theme);
	return data(
		{ success: true },
		{ headers: { "Set-Cookie": await themeSession.commit() } },
	);
};

export const loader: LoaderFunction = () => redirect("/", { status: 404 });
