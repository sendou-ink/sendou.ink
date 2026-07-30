import type { LoaderFunctionArgs } from "react-router";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
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

	const trophies = await TrophyRepository.findByOwnerUserId(user.id);

	return {
		type: "old" as const,
		user,
		trophies,
		...userCards,
	};
};
