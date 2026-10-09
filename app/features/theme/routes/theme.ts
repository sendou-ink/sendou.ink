import { data, type LoaderFunction, redirect } from "react-router";
import * as v from "valibot";
import { defineAction } from "~/form/define-action.server";
import { isTheme } from "../core/provider";
import { getThemeSession } from "../core/theme-session.server";

const themeActionSchema = v.object({
	theme: v.optional(v.string()),
});

export const action = defineAction(
	{ body: themeActionSchema },
	async ({ request, body: { theme } }) => {
		const themeSession = await getThemeSession(request);

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
	},
);

export const loader: LoaderFunction = () => redirect("/", { status: 404 });
