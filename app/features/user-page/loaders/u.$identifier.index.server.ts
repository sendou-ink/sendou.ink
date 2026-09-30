import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";

export const loader = async () => {
	const userId = userPageUserId();

	const userCards = await UserCardRepository.findAllByUserIds({
		userIds: [userId],
	});

	return {
		widgets: await UserRepository.findWidgetsByUserId(userId),
		...userCards,
	};
};
