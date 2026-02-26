import { isFuture } from "date-fns";
import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	requirePermission,
	requireRole,
} from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { orgPageActionSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const organization = await organizationFromParams(params);
	const data = await parseRequestPayload({
		request,
		schema: orgPageActionSchema,
	});

	switch (data._action) {
		case "BAN_USER": {
			requirePermission(organization, "BAN");

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
					? dateToDatabaseTimestamp(data.expiresAt)
					: null,
			});

			logger.info(
				`User banned: organization=${organization.name} (${organization.id}), userId=${data.userId}, banned by userId=${user.id}`,
			);

			break;
		}
		case "UNBAN_USER": {
			requirePermission(organization, "BAN");

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
			requireRole("ADMIN");

			await TournamentOrganizationRepository.updateIsEstablished(
				organization.id,
				data.isEstablished,
			);

			logger.info(
				`Organization isEstablished updated: organization=${organization.name} (${organization.id}), isEstablished=${data.isEstablished}, updated by userId=${user.id}`,
			);

			break;
		}
		case "LEAVE_ORGANIZATION": {
			const member = organization.members.find((m) => m.id === user.id);
			errorToastIfFalsy(member, "You are not a member of this organization");

			const adminCount = organization.members.filter(
				(m) => m.role === "ADMIN",
			).length;
			if (member.role === "ADMIN" && adminCount === 1) {
				errorToast("Cannot leave as the sole admin of the organization");
			}

			await TournamentOrganizationRepository.removeMember({
				organizationId: organization.id,
				userId: user.id,
			});

			logger.info(
				`User left organization: organization=${organization.name} (${organization.id}), userId=${user.id}`,
			);

			break;
		}
		case "DELETE_ORGANIZATION": {
			requireRole("ADMIN");

			await TournamentOrganizationRepository.deleteById(organization.id);

			logger.info(
				`Organization deleted: organization=${organization.name} (${organization.id}), deleted by userId=${user.id}`,
			);

			throw redirect("/");
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
