import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";

export type UserPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = getUser();

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(
			params.identifier!,
			loggedInUser?.id,
		),
	);

	return {
		user: {
			...user,
			css: undefined,
		},
		css: user.css,
		// xxx: resolve real
		type: "new" as const,
	};
};
