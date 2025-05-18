import type { LoaderFunctionArgs } from "@remix-run/node";
import { isImpersonating, requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { adminActionSearchParamsSchema } from "../admin-schemas";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	// allow unauthorized access in development mode to access impersonation controls
	if (process.env.NODE_ENV === "production") {
		const user = await requireUser(request);
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
