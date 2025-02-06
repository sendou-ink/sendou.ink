import type { ActionFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { makeArtist } from "~/features/art/queries/makeArtist.server";
import { requireUserId } from "~/features/auth/core/user.server";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin, isMod } from "~/permissions";
import { logger } from "~/utils/logger";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { _action, actualNumber, friendCode } from "~/utils/zod";
import { plusTiersFromVotingAndLeaderboard } from "../core/plus-tier.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: adminActionSchema,
	});
	const user = await requireUserId(request);

	switch (data._action) {
		case "MIGRATE": {
			validate(isMod(user), "Admin needed", 401);

			await AdminRepository.migrate({
				oldUserId: data["old-user"],
				newUserId: data["new-user"],
			});
			break;
		}
		case "REFRESH": {
			validate(isAdmin(user));

			await AdminRepository.replacePlusTiers(
				await plusTiersFromVotingAndLeaderboard(),
			);
			break;
		}
		case "FORCE_PATRON": {
			validate(isAdmin(user), "Admin needed", 401);

			await AdminRepository.forcePatron({
				id: data.user,
				patronSince: new Date(),
				patronTier: data.patronTier,
				patronTill: new Date(data.patronTill),
			});
			break;
		}
		case "CLEAN_UP": {
			validate(isAdmin(user), "Admin needed", 401);

			// on purpose sync
			AdminRepository.cleanUp();
			break;
		}
		case "ARTIST": {
			validate(isMod(user), "Mod needed", 401);

			makeArtist(data.user);
			break;
		}
		case "VIDEO_ADDER": {
			validate(isMod(user), "Mod needed", 401);

			await AdminRepository.makeVideoAdderByUserId(data.user);
			break;
		}
		case "TOURNAMENT_ORGANIZER": {
			validate(isMod(user), "Mod needed", 401);

			await AdminRepository.makeTournamentOrganizerByUserId(data.user);
			break;
		}
		case "LINK_PLAYER": {
			validate(isMod(user), "Mod needed", 401);

			await AdminRepository.linkUserAndPlayer({
				userId: data.user,
				playerId: data.playerId,
			});

			break;
		}
		case "BAN_USER": {
			validate(isMod(user), "Mod needed", 401);

			await AdminRepository.banUser({
				bannedReason: data.reason ?? null,
				userId: data.user,
				banned: data.duration ? new Date(data.duration) : 1,
			});

			refreshBannedCache();

			logger.info("Banned user", {
				userId: data.user,
				byUserId: user.id,
				reason: data.reason,
				duration: data.duration
					? new Date(data.duration).toLocaleString()
					: undefined,
			});

			break;
		}
		case "UNBAN_USER": {
			validate(isMod(user), "Mod needed", 401);

			await AdminRepository.unbanUser(data.user);

			refreshBannedCache();

			logger.info("Unbanned user", {
				userId: data.user,
				byUserId: user.id,
			});

			break;
		}
		case "UPDATE_FRIEND_CODE": {
			validate(isMod(user), "Mod needed", 401);

			await UserRepository.insertFriendCode({
				friendCode: data.friendCode,
				submitterUserId: user.id,
				userId: data.user,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return { ok: true };
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
]);
