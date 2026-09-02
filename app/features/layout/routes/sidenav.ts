import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { getSidenavSession } from "~/features/layout/core/sidenav-session.server";
import { safeReturnTo } from "~/utils/remix.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const sidenavSession = await getSidenavSession(request);
	const formData = await request.formData();
	const collapsed = formData.get("collapsed") === "true";

	sidenavSession.setCollapsed(collapsed);

	const headers = { "Set-Cookie": await sidenavSession.commit() };

	// a document form post (no JavaScript) has nowhere to show the data
	const returnTo = safeReturnTo(formData.get("returnTo"));
	if (returnTo) {
		return redirect(returnTo, { headers });
	}

	return data({ success: true }, { headers });
};
