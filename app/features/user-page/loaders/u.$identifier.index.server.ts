import type { LoaderFunctionArgs } from "react-router";
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

	return {
		widgets: await UserRepository.findWidgetsByUserId(userId),
		...userCards,
	};
};
