import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfNullish } from "~/utils/remix.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: userId } = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(params.identifier!),
	);

	const userCards = await UserCardRepository.findAllByUserIds({
		userIds: [userId],
	});

	const widgetsEnabled = await UserRepository.findEnabledWidgetsByIdentifier(
		params.identifier!,
	);

	if (widgetsEnabled) {
		return {
			type: "new" as const,
			widgets: notFoundIfNullish(
				await UserRepository.findWidgetsByUserId(params.identifier!),
			),
			...userCards,
		};
	}

	const user = notFoundIfNullish(
		await UserRepository.findProfileByIdentifier(params.identifier!),
	);

	const trophies = canAccessTrophies(getUser())
		? await TrophyRepository.findByOwnerUserId(user.id)
		: [];

	return {
		type: "old" as const,
		user,
		trophies,
		...userCards,
	};
};
