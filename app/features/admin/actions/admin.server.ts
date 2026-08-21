import type { ActionFunctionArgs } from "react-router";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	errorToast,
	notFoundIfNullish,
	successToast,
} from "~/utils/remix.server";
import { normalizeFriendCode } from "~/utils/schema";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { adminActionSchema } from "../admin-schemas";
import {
	sendUserBannedWebhook,
	sendUserUnbannedWebhook,
} from "../core/discord-webhook.server";
import { plusTiersFromVotingAndLeaderboard } from "../core/plus-tier.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const result = await parseFormData({
		request,
		schema: adminActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;
	const user = requireUser();

	let message: string;
	switch (data._action) {
		case "MIGRATE": {
			requireRole("STAFF");

			try {
				const errorMessage = await AdminRepository.migrate({
					oldUserId: data.oldUser,
					newUserId: data.newUser,
				});

				if (errorMessage) {
					errorToast(`Migration failed. Reason: ${errorMessage}`);
				}

				await refreshBannedCache();

				message = "Account migrated";
				break;
			} catch (err) {
				if (errorIsSqliteForeignKeyConstraintFailure(err)) {
					errorToast(
						"New user has data preventing the migration (e.g. member of tournament teams or SendouQ played)",
					);
				}

				throw err;
			}
		}
		case "REFRESH": {
			requireRole("ADMIN");

			await AdminRepository.replacePlusTiers(
				await plusTiersFromVotingAndLeaderboard(),
			);

			message = "Plus tiers refreshed";
			break;
		}
		case "FORCE_PATRON": {
			requireRole("ADMIN");

			await AdminRepository.forcePatron({
				id: data.user,
				patronStartedAt: new Date(),
				patronTier: Number(data.patronTier),
				patronExpiresAt: data.patronExpiresAt,
			});

			message = "Patron status updated";
			break;
		}
		case "ARTIST": {
			requireRole("STAFF");

			await AdminRepository.makeArtistByUserId(data.user);

			message = "Artist permissions given";
			break;
		}
		case "VIDEO_ADDER": {
			requireRole("STAFF");

			await AdminRepository.makeVideoAdderByUserId(data.user);

			message = "VoD adder permissions given";
			break;
		}
		case "TOURNAMENT_ORGANIZER": {
			requireRole("ADMIN");

			await AdminRepository.makeTournamentOrganizerByUserId(data.user);

			message = "Tournament permissions given";
			break;
		}
		case "LINK_PLAYER": {
			requireRole("STAFF");

			await AdminRepository.linkUserAndPlayer({
				userId: data.user,
				playerId: data.playerId,
			});

			message = "Linked user and player";
			break;
		}
		case "BAN_USER": {
			requireRole("STAFF");

			const bannedUser = notFoundIfNullish(
				await UserRepository.findLeanById(data.user),
			);
			const banExpiresAt = data.expiresAt ?? null;

			await AdminRepository.banUser({
				bannedReason: data.reason ?? null,
				userId: data.user,
				banned: banExpiresAt ?? 1,
				bannedByUserId: user.id,
			});

			await refreshBannedCache();

			sendUserBannedWebhook({
				bannedUser,
				bannedBy: user,
				reason: data.reason ?? null,
				expiresAt: banExpiresAt,
			});

			message = "User banned";
			break;
		}
		case "UNBAN_USER": {
			requireRole("STAFF");

			const unbannedUser = notFoundIfNullish(
				await UserRepository.findLeanById(data.user),
			);

			await AdminRepository.unbanUser({
				userId: data.user,
				unbannedByUserId: user.id,
			});

			await refreshBannedCache();

			sendUserUnbannedWebhook({
				unbannedUser,
				unbannedBy: user,
			});

			message = "User unbanned";
			break;
		}
		case "UPDATE_FRIEND_CODE": {
			requireRole("STAFF");

			await UserRepository.insertFriendCode({
				friendCode: normalizeFriendCode(data.friendCode),
				submitterUserId: user.id,
				userId: data.user,
			});

			message = "Friend code updated";
			break;
		}
		case "API_ACCESS": {
			requireRole("ADMIN");

			await AdminRepository.makeApiAccesserByUserId(data.user);

			message = "API access granted";
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return successToast(message);
};
