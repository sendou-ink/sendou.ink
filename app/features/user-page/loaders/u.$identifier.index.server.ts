import type { LoaderFunctionArgs } from "react-router";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const widgetsEnabled = await UserRepository.widgetsEnabledByIdentifier(
		params.identifier!,
	);

	if (widgetsEnabled) {
		return {
			type: "new" as const,
			widgets: notFoundIfFalsy(
				await UserRepository.widgetsByUserId(params.identifier!),
			),
		};
	}

	const user = notFoundIfFalsy(
		await UserRepository.findProfileByIdentifier(params.identifier!),
	);

	return {
		type: "old" as const,
		user,
	};
};
