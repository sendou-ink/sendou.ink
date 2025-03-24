import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";

export type UserPageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);

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
	};
};
