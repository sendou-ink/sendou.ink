import { z } from "zod/v4";
import {
	_action,
	checkboxValueToBoolean,
	id,
	modeShort,
	optionalId,
	safeJSONParse,
	safeStringSchema,
	stageId,
} from "~/utils/zod";
import { bracketProgressionSchema } from "../calendar/calendar-schemas";
import { bracketIdx } from "../tournament-bracket/tournament-bracket-schemas.server";
import { USER } from "../user-page/user-page-constants";
import { TOURNAMENT } from "./tournament-constants";

export const teamName = safeStringSchema({
	max: TOURNAMENT.TEAM_NAME_MAX_LENGTH,
});

export const registerSchema = z.union([
	z.object({
		_action: _action("UPSERT_TEAM"),
		teamName,
		prefersNotToHost: z.preprocess(checkboxValueToBoolean, z.boolean()),
		teamId: optionalId,
	}),
	z.object({
		_action: _action("UPDATE_MAP_POOL"),
		mapPool: z.preprocess(
			safeJSONParse,
			z.array(z.object({ stageId, mode: modeShort })),
		),
	}),
	z.object({
		_action: _action("DELETE_TEAM_MEMBER"),
		userId: id,
	}),
	z.object({
		_action: _action("LEAVE_TEAM"),
	}),
	z.object({
		_action: _action("CHECK_IN"),
	}),
	z.object({
		_action: _action("ADD_PLAYER"),
		userId: id,
	}),
	z.object({
		_action: _action("UNREGISTER"),
	}),
	z.object({
		_action: _action("DELETE_LOGO"),
	}),
]);

export const seedsActionSchema = z.union([
	z.object({
		_action: _action("UPDATE_SEEDS"),
		seeds: z.preprocess(safeJSONParse, z.array(id)),
	}),
	z.object({
		_action: _action("UPDATE_STARTING_BRACKETS"),
		startingBrackets: z.preprocess(
			safeJSONParse,
			z.array(
				z.object({
					tournamentTeamId: id,
					startingBracketIdx: bracketIdx,
				}),
			),
		),
	}),
]);

export const joinSchema = z.object({
	trust: z.preprocess(checkboxValueToBoolean, z.boolean()),
});

export const tournamentSearchSearchParamsSchema = z.object({
	q: z.string().max(100),
	limit: z.coerce.number().int().min(1).max(25).catch(25),
	minStartTime: z.coerce.date().optional().catch(undefined),
});

export const adminActionSchema = z.union([
	z.object({
		_action: _action("CHANGE_TEAM_OWNER"),
		teamId: id,
		memberId: id,
	}),
	z.object({
		_action: _action("CHANGE_TEAM_NAME"),
		teamId: id,
		teamName,
	}),
	z.object({
		_action: _action("CHECK_IN"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("CHECK_OUT"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("ADD_MEMBER"),
		teamId: id,
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MEMBER"),
		teamId: id,
		memberId: id,
	}),
	z.object({
		_action: _action("DELETE_TEAM"),
		teamId: id,
	}),
	z.object({
		_action: _action("ADD_TEAM"),
		userId: id,
		teamName,
	}),
	z.object({
		_action: _action("ADD_STAFF"),
		userId: id,
		role: z.enum(["ORGANIZER", "STREAMER"]),
	}),
	z.object({
		_action: _action("REMOVE_STAFF"),
		userId: id,
	}),
	z.object({
		_action: _action("DROP_TEAM_OUT"),
		teamId: id,
	}),
	z.object({
		_action: _action("UNDO_DROP_TEAM_OUT"),
		teamId: id,
	}),
	z.object({
		_action: _action("DELETE_LOGO"),
		teamId: id,
	}),
	z.object({
		_action: _action("UPDATE_CAST_TWITCH_ACCOUNTS"),
		castTwitchAccounts: z.preprocess(
			(val) =>
				typeof val === "string"
					? val
							.split(",")
							.map((account) => account.trim())
							.map((account) => account.toLowerCase())
					: val,
			z.array(z.string()),
		),
	}),
	z.object({
		_action: _action("RESET_BRACKET"),
		stageId: id,
	}),
	z.object({
		_action: _action("UPDATE_IN_GAME_NAME"),
		inGameNameText: z.string().max(USER.IN_GAME_NAME_TEXT_MAX_LENGTH),
		inGameNameDiscriminator: z
			.string()
			.refine((val) => /^[0-9a-z]{4,5}$/.test(val)),
		memberId: id,
	}),
	z.object({
		_action: _action("UPDATE_TOURNAMENT_PROGRESSION"),
		bracketProgression: bracketProgressionSchema,
	}),
]);
