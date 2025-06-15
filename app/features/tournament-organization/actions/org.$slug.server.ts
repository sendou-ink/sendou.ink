import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { logger } from "~/utils/logger";
import { parseRequestPayload } from "~/utils/remix.server";
import { errorToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { orgPageActionSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const organization = await organizationFromParams(params);
	const data = await parseRequestPayload({
		request,
		schema: orgPageActionSchema,
	});

	requirePermission(organization, "BAN", user);

	switch (data._action) {
		case "BAN_USER": {
			const bannedUsers =
				await TournamentOrganizationRepository.allBannedUsersByOrganizationId(
					organization.id,
				);

			if (bannedUsers.length >= TOURNAMENT_ORGANIZATION.MAX_BANNED_USERS) {
				errorToast(
					`Organization cannot ban more than ${TOURNAMENT_ORGANIZATION.MAX_BANNED_USERS} users`,
				);
			}

			await TournamentOrganizationRepository.upsertBannedUser({
				organizationId: organization.id,
				userId: data.userId,
				privateReason: data.privateReason,
			});

			logger.info(
				`User banned: organization=${organization.name} (${organization.id}), userId=${data.userId}, banned by userId=${user.id}`,
			);

			break;
		}
		case "UNBAN_USER": {
			await TournamentOrganizationRepository.unbanUser({
				organizationId: organization.id,
				userId: data.userId,
			});

			logger.info(
				`User unbanned: organization=${organization.name} (${organization.id}), userId=${data.userId}, unbanned by userId=${user.id}`,
			);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
