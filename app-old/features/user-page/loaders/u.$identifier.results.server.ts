import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";

export type UserResultsLoaderData = SerializeFrom<typeof loader>;

// TODO: could further optimize by only loading highlighted results when needed
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const userId = notFoundIfFalsy(
		await UserRepository.identifierToUserId(params.identifier!),
	).id;

	return {
		results: await UserRepository.findResultsByUserId(userId),
	};
};
