import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { refreshApiTokensCache } from "~/features/api-public/api-public-utils.server";
import { requireUser } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
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

export const action = defineAction(
	{ body: adminActionSchema },
	async ({ body }) => {
		const user = requireUser();

		let message: string;
		switch (body._action) {
			case "MIGRATE": {
				requireRole("STAFF");

				try {
					const errorMessage = await AdminRepository.migrate({
						oldUserId: body.oldUser,
						newUserId: body.newUser,
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
					id: body.user,
					patronStartedAt: new Date(),
					patronTier: Number(body.patronTier),
					patronExpiresAt: body.patronExpiresAt,
				});

				message = "Patron status updated";
				break;
			}
			case "ARTIST": {
				requireRole("STAFF");

				await AdminRepository.makeArtistByUserId(body.user);

				message = "Artist permissions given";
				break;
			}
			case "VIDEO_ADDER": {
				requireRole("STAFF");

				await AdminRepository.makeVideoAdderByUserId(body.user);

				message = "VoD adder permissions given";
				break;
			}
			case "TOURNAMENT_ORGANIZER": {
				requireRole("ADMIN");

				await AdminRepository.makeTournamentOrganizerByUserId(body.user);

				message = "Tournament permissions given";
				break;
			}
			case "LINK_PLAYER": {
				requireRole("STAFF");

				await AdminRepository.linkUserAndPlayer({
					userId: body.user,
					playerId: body.playerId,
				});

				message = "Linked user and player";
				break;
			}
			case "BAN_USER": {
				requireRole("STAFF");

				const bannedUser = notFoundIfNullish(
					await UserRepository.findLeanById(body.user),
				);
				const banExpiresAt = body.expiresAt ?? null;

				await AdminRepository.banUser({
					bannedReason: body.reason ?? null,
					userId: body.user,
					banned: banExpiresAt ?? 1,
					bannedByUserId: user.id,
				});

				await refreshBannedCache();
				await refreshApiTokensCache();

				sendUserBannedWebhook({
					bannedUser,
					bannedBy: user,
					reason: body.reason ?? null,
					expiresAt: banExpiresAt,
				});

				message = "User banned";
				break;
			}
			case "UNBAN_USER": {
				requireRole("STAFF");

				const unbannedUser = notFoundIfNullish(
					await UserRepository.findLeanById(body.user),
				);

				await AdminRepository.unbanUser({
					userId: body.user,
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
					friendCode: normalizeFriendCode(body.friendCode),
					submitterUserId: user.id,
					userId: body.user,
				});

				message = "Friend code updated";
				break;
			}
			case "API_ACCESS": {
				requireRole("ADMIN");

				await AdminRepository.makeApiAccesserByUserId(body.user);

				message = "API access granted";
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return successToast(message);
	},
);
