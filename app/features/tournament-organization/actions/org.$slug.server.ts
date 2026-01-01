import { isFuture } from "date-fns";
import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
	dayMonthYearToDate,
} from "~/utils/dates";
import { logger } from "~/utils/logger";
import { errorToast, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { orgPageActionSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUser();
	const organization = await organizationFromParams(params);
	const data = await parseRequestPayload({
		request,
		schema: orgPageActionSchema,
	});

	switch (data._action) {
		case "BAN_USER": {
			requirePermission(organization, "BAN", user);

			const allBannedUsers =
				await TournamentOrganizationRepository.allBannedUsersByOrganizationId(
					organization.id,
				);
			const currentlyBannedUsers = allBannedUsers.filter(
				(bu) =>
					!bu.expiresAt || isFuture(databaseTimestampToDate(bu.expiresAt)),
			);

			if (
				currentlyBannedUsers.length >= TOURNAMENT_ORGANIZATION.MAX_BANNED_USERS
			) {
				errorToast(
					`Organization cannot ban more than ${TOURNAMENT_ORGANIZATION.MAX_BANNED_USERS} users`,
				);
			}

			await TournamentOrganizationRepository.upsertBannedUser({
				organizationId: organization.id,
				userId: data.userId,
				privateNote: data.privateNote,
				expiresAt: data.expiresAt
					? dateToDatabaseTimestamp(dayMonthYearToDate(data.expiresAt))
					: null,
			});

			logger.info(
				`User banned: organization=${organization.name} (${organization.id}), userId=${data.userId}, banned by userId=${user.id}`,
			);

			break;
		}
		case "UNBAN_USER": {
			requirePermission(organization, "BAN", user);

			await TournamentOrganizationRepository.unbanUser({
				organizationId: organization.id,
				userId: data.userId,
			});

			logger.info(
				`User unbanned: organization=${organization.name} (${organization.id}), userId=${data.userId}, unbanned by userId=${user.id}`,
			);

			break;
		}
		case "UPDATE_IS_ESTABLISHED": {
			requireRole(user, "ADMIN");

			await TournamentOrganizationRepository.updateIsEstablished(
				organization.id,
				data.isEstablished,
			);

			logger.info(
				`Organization isEstablished updated: organization=${organization.name} (${organization.id}), isEstablished=${data.isEstablished}, updated by userId=${user.id}`,
			);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
