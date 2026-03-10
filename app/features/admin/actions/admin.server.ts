import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	errorToast,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { _action, actualNumber, friendCode } from "~/utils/zod";
import * as AdminNotifications from "../core/admin-notifications.server";
import { plusTiersFromVotingAndLeaderboard } from "../core/plus-tier.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: adminActionSchema,
	});
	const user = requireUser();

	let message: string;
	switch (data._action) {
		case "MIGRATE": {
			requireRole("STAFF");

			try {
				const errorMessage = await AdminRepository.migrate({
					oldUserId: data["old-user"],
					newUserId: data["new-user"],
				});

				if (errorMessage) {
					errorToast(`Migration failed. Reason: ${errorMessage}`);
				}

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

			await BuildRepository.recalculateAllTiers();

			message = "Plus tiers refreshed";
			break;
		}
		case "FORCE_PATRON": {
			requireRole("ADMIN");

			await AdminRepository.forcePatron({
				id: data.user,
				patronSince: new Date(),
				patronTier: data.patronTier,
				patronTill: new Date(data.patronTill),
			});

			message = "Patron status updated";
			break;
		}
		case "CLEAN_UP": {
			requireRole("ADMIN");

			// on purpose sync
			AdminRepository.cleanUp();

			message = "Clean up done";
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

			await AdminRepository.banUser({
				bannedReason: data.reason ?? null,
				userId: data.user,
				banned: data.duration ? new Date(data.duration) : 1,
				bannedByUserId: user.id,
			});

			await refreshBannedCache();

			message = "User banned";
			break;
		}
		case "UNBAN_USER": {
			requireRole("STAFF");

			await AdminRepository.unbanUser({
				userId: data.user,
				unbannedByUserId: user.id,
			});

			await refreshBannedCache();

			message = "User unbanned";
			break;
		}
		case "UPDATE_FRIEND_CODE": {
			requireRole("STAFF");

			await UserRepository.insertFriendCode({
				friendCode: data.friendCode,
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
		case "TEST_ADMIN_NOTIFICATION": {
			requireRole("ADMIN");

			await AdminNotifications.send("Test notification from admin panel");

			message = "Test notification sent";
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return successToast(message);
};

export const adminActionSchema = z.union([
	z.object({
		_action: _action("MIGRATE"),
		"old-user": z.preprocess(actualNumber, z.number().positive()),
		"new-user": z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("REFRESH"),
	}),
	z.object({
		_action: _action("CLEAN_UP"),
	}),
	z.object({
		_action: _action("FORCE_PATRON"),
		user: z.preprocess(actualNumber, z.number().positive()),
		patronTier: z.preprocess(actualNumber, z.number()),
		patronTill: z.string(),
	}),
	z.object({
		_action: _action("VIDEO_ADDER"),
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("TOURNAMENT_ORGANIZER"),
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("ARTIST"),
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("LINK_PLAYER"),
		user: z.preprocess(actualNumber, z.number().positive()),
		playerId: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("BAN_USER"),
		user: z.preprocess(actualNumber, z.number().positive()),
		reason: z.string().nullish(),
		duration: z.string().nullish(),
	}),
	z.object({
		_action: _action("UNBAN_USER"),
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("UPDATE_FRIEND_CODE"),
		friendCode,
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("API_ACCESS"),
		user: z.preprocess(actualNumber, z.number().positive()),
	}),
	z.object({
		_action: _action("TEST_ADMIN_NOTIFICATION"),
	}),
]);
