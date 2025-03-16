import type { LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUserId, isImpersonating } from "~/features/auth/core/user.server";
import { isMod } from "~/permissions";

export const loader: LoaderFunction = async ({ request }) => {
	const user = await getUserId(request);

	if (process.env.NODE_ENV === "production" && !isMod(user)) {
		throw redirect("/");
	}

	return {
		isImpersonating: await isImpersonating(request),
	};
};
