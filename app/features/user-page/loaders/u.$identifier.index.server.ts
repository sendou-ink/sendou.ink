import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin } from "~/permissions";
import { notFoundIfFalsy } from "~/utils/remix.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);

	const user = notFoundIfFalsy(
		await UserRepository.findProfileByIdentifier(params.identifier!),
	);

	return {
		user,
		banned:
			isAdmin(loggedInUser) && userIsBanned(user.id)
				? await UserRepository.findBannedStatusByUserId(user.id)!
				: undefined,
	};
};
