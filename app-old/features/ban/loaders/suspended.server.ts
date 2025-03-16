import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import {
	IMPERSONATED_SESSION_KEY,
	SESSION_KEY,
} from "~/features/auth/core/authenticator.server";
import { authSessionStorage } from "~/features/auth/core/session.server";
import type { Nullish } from "~/utils/types";
import { cachedBannedUsers, userIsBanned } from "../core/banned.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const userId = await getUserIdEvenIfBanned(request);

	if (!userId || !userIsBanned(userId)) return redirect("/");

	const bannedStatus = cachedBannedUsers().get(userId)!;

	return {
		banned: bannedStatus.banned,
		reason: bannedStatus.bannedReason,
	};
};

async function getUserIdEvenIfBanned(
	request: Request,
): Promise<Nullish<number>> {
	const session = await authSessionStorage.getSession(
		request.headers.get("Cookie"),
	);
	return session.get(IMPERSONATED_SESSION_KEY) ?? session.get(SESSION_KEY);
}
