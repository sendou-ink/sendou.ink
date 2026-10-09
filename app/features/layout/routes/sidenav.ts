import { data, redirect } from "react-router";
import * as v from "valibot";
import { getSidenavSession } from "~/features/layout/core/sidenav-session.server";
import { defineAction } from "~/form/define-action.server";
import { safeReturnTo } from "~/utils/remix.server";

const sidenavActionSchema = v.object({
	collapsed: v.optional(v.string()),
	returnTo: v.optional(v.string()),
});

export const action = defineAction(
	{ body: sidenavActionSchema },
	async ({ request, body }) => {
		const sidenavSession = await getSidenavSession(request);

		sidenavSession.setCollapsed(body.collapsed === "true");

		const headers = { "Set-Cookie": await sidenavSession.commit() };

		// a document form post (no JavaScript) has nowhere to show the data
		const returnTo = safeReturnTo(body.returnTo ?? null);
		if (returnTo) {
			return redirect(returnTo, { headers });
		}

		return data({ success: true }, { headers });
	},
);
