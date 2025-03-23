import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUserId, isImpersonating } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isMod } from "~/permissions";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { adminActionSearchParamsSchema } from "../admin-schemas";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const parsedSearchParams = parseSafeSearchParams({
		request,
		schema: adminActionSearchParamsSchema,
	});

	if (process.env.NODE_ENV === "production" && !isMod(user)) {
		throw redirect("/");
	}

	return {
		isImpersonating: await isImpersonating(request),
		friendCodeSearchUsers: parsedSearchParams.success
			? await UserRepository.findByFriendCode(
					parsedSearchParams.data.friendCode,
				)
			: [],
	};
};
