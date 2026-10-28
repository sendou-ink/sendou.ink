import { type LoaderFunctionArgs, redirect } from "react-router";
import {
	IMPERSONATED_SESSION_KEY,
	SESSION_KEY,
} from "~/features/auth/core/authenticator.server";
import { authSessionStorage } from "~/features/auth/core/session.server";
import { safeReturnTo } from "~/utils/remix.server";
import { logInAsSearchParams } from "../dev-tools-search-params";
import { requireDevTools } from "../dev-tools-utils.server";

// a GET so that the link a scenario run prints can be opened straight from a terminal
export const loader = async ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	const { userId, returnTo } = logInAsSearchParams.parse(request);

	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);

	if (userId && userId !== session.get(SESSION_KEY)) {
		session.set(IMPERSONATED_SESSION_KEY, userId);
	} else {
		session.unset(IMPERSONATED_SESSION_KEY);
	}

	throw redirect(safeReturnTo(returnTo) ?? "/", {
		headers: {
			"Set-Cookie": await authSessionStorage.commitSession(session),
		},
	});
};
