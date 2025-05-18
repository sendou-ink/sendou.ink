import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUser(request);

	const user = notFoundIfFalsy(
		await UserRepository.findProfileByIdentifier(params.identifier!),
	);

	return {
		user,
		banned:
			loggedInUser?.roles.includes("ADMIN") && userIsBanned(user.id)
				? await UserRepository.findBannedStatusByUserId(user.id)!
				: undefined,
	};
};
