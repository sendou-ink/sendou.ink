import type { LoaderFunctionArgs } from "react-router";
import { isImpersonating, requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { adminActionSearchParamsSchema } from "../admin-schemas";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "../core/dev-controls";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		const user = requireUser();
		requireRole(user, "STAFF");
	}

	const parsedSearchParams = parseSafeSearchParams({
		request,
		schema: adminActionSearchParamsSchema,
	});

	return {
		isImpersonating: await isImpersonating(request),
		friendCodeSearchUsers: parsedSearchParams.success
			? await UserRepository.findByFriendCode(
					parsedSearchParams.data.friendCode,
				)
			: [],
	};
};
