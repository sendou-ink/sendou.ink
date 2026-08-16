import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	clearTheme,
	isTheme,
	setTheme,
} from "#lib/features/theme/theme.server.ts";

export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = new URLSearchParams(await request.text());
	const theme = form.get("theme");

	if (theme === "auto") {
		clearTheme(cookies);
		return json({ success: true });
	}

	if (!isTheme(theme)) {
		return json({
			success: false,
			message: `theme value of ${theme ?? "null"} is not a valid theme`,
		});
	}

	setTheme(cookies, theme);
	return json({ success: true });
};

// matches the React route's loader: a 404-status redirect home
export const GET: RequestHandler = () => {
	return new Response(null, { status: 404, headers: { Location: "/" } });
};
