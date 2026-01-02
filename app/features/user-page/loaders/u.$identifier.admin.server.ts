import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { logger } from "~/utils/logger";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { convertSnowflakeToDate } from "~/utils/users";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = await requireUser();

	requireRole(loggedInUser, "STAFF");

	const user = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(params.identifier!),
	);

	logger.info(
		`User ${loggedInUser.username} (#${loggedInUser.id}) is viewing admin tab for user ${user.username} (#${user.id})`,
	);

	const userData = notFoundIfFalsy(
		await UserRepository.findModInfoById(user.id),
	);

	const friendCodes = await UserRepository.friendCodesByUserId(user.id);

	return {
		...userData,
		discordId: user.discordId,
		discordAccountCreatedAt: convertSnowflakeToDate(user.discordId).getTime(),
		friendCodes,
	};
};
