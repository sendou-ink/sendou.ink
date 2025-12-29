import type { LoaderFunctionArgs } from "react-router";
import { getUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);

	return {
		noScreen: user
			? await UserRepository.anyUserPrefersNoScreen([user.id])
			: null,
	};
};
