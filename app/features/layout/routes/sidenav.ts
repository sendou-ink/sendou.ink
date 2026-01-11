import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getSidenavSession } from "~/features/layout/core/sidenav-session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const sidenavSession = await getSidenavSession(request);
	const formData = await request.formData();
	const collapsed = formData.get("collapsed") === "true";

	sidenavSession.setCollapsed(collapsed);

	return data(
		{ success: true },
		{
			headers: { "Set-Cookie": await sidenavSession.commit() },
		},
	);
};
