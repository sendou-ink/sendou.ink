import type { LoaderFunction } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { canAccessLohiEndpoint, forbidden } from "~/utils/remix.server";

export interface PlusListLoaderData {
	users: Record<string, number>;
}

export const loader: LoaderFunction = async ({ request }) => {
	if (!canAccessLohiEndpoint(request)) {
		forbidden();
	}

	return {
		users: Object.fromEntries(
			(await UserRepository.findAllPlusServerMembers()).map((u) => [
				u.discordId,
				u.plusTier,
			]),
		),
	};
};
