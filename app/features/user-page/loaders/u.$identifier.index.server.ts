import type { LoaderFunctionArgs } from "react-router";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: userId } = notFoundIfFalsy(
		await UserRepository.identifierToUserId(params.identifier!),
	);

	const userCards = await UserCardRepository.userCards({ userIds: [userId] });

	const widgetsEnabled = await UserRepository.widgetsEnabledByIdentifier(
		params.identifier!,
	);

	if (widgetsEnabled) {
		return {
			type: "new" as const,
			widgets: notFoundIfFalsy(
				await UserRepository.widgetsByUserId(params.identifier!),
			),
			...userCards,
		};
	}

	const user = notFoundIfFalsy(
		await UserRepository.findProfileByIdentifier(params.identifier!),
	);

	return {
		type: "old" as const,
		user,
		...userCards,
	};
};
