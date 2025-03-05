import { z } from "zod";
import {
	_action,
	id,
	modeShort,
	nullLiteraltoNull,
	numericEnum,
	safeJSONParse,
	stageId,
} from "~/utils/zod";
import { TOURNAMENT } from "../tournament/tournament-constants";
import * as PreparedMaps from "./core/PreparedMaps";

const activeRosterPlayerIds = z.preprocess(safeJSONParse, z.array(id));

const bothTeamPlayerIds = z.preprocess(
	safeJSONParse,
	z.tuple([z.array(id), z.array(id)]),
);

const reportedMatchPosition = z.preprocess(
	Number,
	z
		.number()
		.int()
		.min(0)
		.max(Math.max(...TOURNAMENT.AVAILABLE_BEST_OF) - 1),
);

const point = z.number().int().min(0).max(100);
const points = z.preprocess(
	safeJSONParse,
	z
		.tuple([point, point])
		.nullish()
		.refine(
			(val) => {
				if (!val) return true;
				const [p1, p2] = val;

				if (p1 === p2) return false;
				if (p1 === 100 && p2 !== 0) return false;
				if (p2 === 100 && p1 !== 0) return false;

				return true;
			},
			{
				message:
					"Invalid points. Must not be equal & if one is 100, the other must be 0.",
			},
		),
);
export const matchSchema = z.union([
	z.object({
		_action: _action("REPORT_SCORE"),
		winnerTeamId: id,
		position: reportedMatchPosition,
		points,
	}),
	z.object({
		_action: _action("SET_ACTIVE_ROSTER"),
		roster: activeRosterPlayerIds,
		teamId: id,
	}),
	z.object({
		_action: _action("BAN_PICK"),
		stageId,
		mode: modeShort,
	}),
	z.object({
		_action: _action("UNDO_REPORT_SCORE"),
		position: reportedMatchPosition,
	}),
	z.object({
		_action: _action("UPDATE_REPORTED_SCORE"),
		rosters: bothTeamPlayerIds,
		resultId: id,
		points,
	}),
	z.object({
		_action: _action("REOPEN_MATCH"),
	}),
	z.object({
		_action: _action("SET_AS_CASTED"),
		twitchAccount: z.preprocess(
			nullLiteraltoNull,
			z.string().min(1).max(100).nullable(),
		),
	}),
	z.object({
		_action: _action("LOCK"),
	}),
	z.object({
		_action: _action("UNLOCK"),
	}),
]);

export const bracketIdx = z.coerce.number().int().min(0).max(100);

const tournamentRoundMaps = z.object({
	roundId: z.number().int().min(0),
	groupId: z.number().int().min(0),
	list: z
		.array(
			z.object({
				mode: modeShort,
				stageId,
			}),
		)
		.nullish(),
	count: numericEnum(TOURNAMENT.AVAILABLE_BEST_OF),
	type: z.enum(["BEST_OF", "PLAY_ALL"]),
	pickBan: z.enum(["COUNTERPICK", "BAN_2"]).nullish(),
});

export const bracketSchema = z.union([
	z.object({
		_action: _action("START_BRACKET"),
		bracketIdx,
		maps: z.preprocess(safeJSONParse, z.array(tournamentRoundMaps)),
	}),
	z.object({
		_action: _action("PREPARE_MAPS"),
		bracketIdx,
		maps: z.preprocess(safeJSONParse, z.array(tournamentRoundMaps)),
		eliminationTeamCount: z.coerce
			.number()
			.optional()
			.refine(
				(val) => !val || PreparedMaps.isValidMaxEliminationTeamCount(val),
			),
	}),
	z.object({
		_action: _action("ADVANCE_BRACKET"),
		groupId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("UNADVANCE_BRACKET"),
		groupId: id,
		roundId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("FINALIZE_TOURNAMENT"),
	}),
	z.object({
		_action: _action("BRACKET_CHECK_IN"),
		bracketIdx,
	}),
	z.object({
		_action: _action("OVERRIDE_BRACKET_PROGRESSION"),
		tournamentTeamId: id,
		sourceBracketIdx: bracketIdx,
		destinationBracketIdx: z.union([bracketIdx, z.literal(-1)]),
	}),
]);

export const matchPageParamsSchema = z.object({ mid: id });

export const tournamentTeamPageParamsSchema = z.object({
	tid: id,
});
