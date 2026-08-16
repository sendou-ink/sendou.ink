import type { LoaderFunctionArgs } from "react-router";
import {
	getRealUserId,
	isImpersonating,
	requireUser,
} from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin, isDev, isStaff } from "~/modules/permissions/utils";
import { normalizeFriendCode } from "~/utils/zod";
import { adminSearchParams } from "../admin-search-params";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "../core/dev-controls";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = requireUser();
		const realUserId = await getRealUserId(request);
		const userToCheck =
			realUserId && realUserId !== user.id ? { id: realUserId } : user;

		if (!isAdmin(userToCheck) && !isStaff(userToCheck) && !isDev(userToCheck)) {
			throw new Response("Forbidden", { status: 403 });
		}
	}

	const { friendCode } = adminSearchParams.parse(request);

	return {
		isImpersonating: await isImpersonating(request),
		friendCodeSearchUsers: friendCode
			? await UserRepository.findByFriendCode(normalizeFriendCode(friendCode))
			: [],
	};
};
