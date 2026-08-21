import * as v from "valibot";
import {
	reportWeaponSchema,
	undoWeaponReportSchema,
} from "~/components/match-page/match-page-schemas";
import {
	ACTION_TYPES,
	WHO_SIDES,
} from "~/features/tournament-bracket/tournament-bracket-constants";
import {
	_action,
	checkboxValueToBoolean,
	coerceNumber,
	id,
	modeShort,
	nullLiteraltoNull,
	numericEnum,
	preprocess,
	safeJSONParse,
	stageId,
} from "~/utils/schema";
import { TOURNAMENT } from "../tournament/tournament-constants";
import * as PickBan from "./core/PickBan";
import * as PreparedMaps from "./core/PreparedMaps";

const activeRosterPlayerIds = preprocess(safeJSONParse, v.array(id));

const bothTeamPlayerIds = preprocess(
	safeJSONParse,
	v.tuple([v.array(id), v.array(id)]),
);

const reportedMatchPosition = preprocess(
	Number,
	v.pipe(
		v.number(),
		v.integer(),
		v.minValue(0),
		v.maxValue(Math.max(...TOURNAMENT.AVAILABLE_BEST_OF) - 1),
	),
);

const ko = v.optional(preprocess(safeJSONParse, v.nullish(v.boolean())));

export const matchSchema = v.union([
	v.object({
		_action: _action("REPORT_SCORE"),
		winnerTeamId: id,
		position: reportedMatchPosition,
		ko,
	}),
	v.object({
		_action: _action("SET_ACTIVE_ROSTER"),
		roster: activeRosterPlayerIds,
		teamId: id,
	}),
	v.object({
		_action: _action("BAN_PICK"),
		stageId: v.optional(stageId),
		mode: v.optional(modeShort),
	}),
	v.object({
		_action: _action("UNDO_REPORT_SCORE"),
		position: reportedMatchPosition,
	}),
	v.object({
		_action: _action("UPDATE_REPORTED_SCORE"),
		rosters: bothTeamPlayerIds,
		resultId: id,
		ko,
	}),
	v.object({
		_action: _action("REOPEN_MATCH"),
	}),
	v.object({
		_action: _action("SET_AS_CASTED"),
		twitchAccount: preprocess(
			nullLiteraltoNull,
			v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
		),
	}),
	v.object({
		_action: _action("LOCK"),
		twitchAccount: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	}),
	v.object({
		_action: _action("UNLOCK"),
	}),
	v.object({
		_action: _action("END_SET"),
		winnerTeamId: preprocess(nullLiteraltoNull, v.nullable(id)),
	}),
	reportWeaponSchema,
	undoWeaponReportSchema,
]);

export const bracketIdx = v.pipe(
	coerceNumber(),
	v.integer(),
	v.minValue(0),
	v.maxValue(100),
);

const customPickBanStep = v.object({
	action: v.picklist(ACTION_TYPES),
	side: v.optional(v.picklist(WHO_SIDES)),
});

const customPickBanFlow = v.optional(
	v.nullable(
		v.object({
			preSet: v.array(customPickBanStep),
			postGame: v.array(customPickBanStep),
		}),
	),
);

const tournamentRoundMaps = v.object({
	roundId: v.pipe(v.number(), v.integer(), v.minValue(0)),
	groupId: v.pipe(v.number(), v.integer(), v.minValue(0)),
	list: v.optional(
		v.nullable(
			v.array(
				v.object({
					mode: modeShort,
					stageId,
				}),
			),
		),
	),
	count: numericEnum(TOURNAMENT.AVAILABLE_BEST_OF),
	type: v.picklist(["BEST_OF", "PLAY_ALL"]),
	pickBan: v.nullish(v.picklist(PickBan.types)),
	customFlow: customPickBanFlow,
});
export const bracketSchema = v.union([
	v.object({
		_action: _action("START_BRACKET"),
		bracketIdx,
		thirdPlaceMatchLinked: v.optional(
			preprocess(checkboxValueToBoolean, v.boolean()),
			false,
		),
		maps: preprocess(safeJSONParse, v.array(tournamentRoundMaps)),
	}),
	v.object({
		_action: _action("PREPARE_MAPS"),
		bracketIdx,
		maps: preprocess(safeJSONParse, v.array(tournamentRoundMaps)),
		thirdPlaceMatchLinked: v.optional(
			preprocess(checkboxValueToBoolean, v.boolean()),
			false,
		),
		eliminationTeamCount: v.pipe(
			v.optional(coerceNumber()),
			v.check(
				(val) => !val || PreparedMaps.isValidMaxEliminationTeamCount(val),
			),
		),
	}),
	v.object({
		_action: _action("ADVANCE_BRACKET"),
		groupId: id,
		bracketIdx,
	}),
	v.object({
		_action: _action("UNADVANCE_BRACKET"),
		groupId: id,
		roundId: id,
		bracketIdx,
	}),
	v.object({
		_action: _action("BRACKET_CHECK_IN"),
		bracketIdx,
	}),
	v.object({
		_action: _action("OVERRIDE_BRACKET_PROGRESSION"),
		tournamentTeamId: id,
		sourceBracketIdx: bracketIdx,
		destinationBracketIdx: v.union([bracketIdx, v.literal(-1)]),
	}),
]);

export const matchPageParamsSchema = v.object({ id, mid: id });

export const tournamentTeamPageParamsSchema = v.object({
	id,
	tid: id,
});

export type TournamentBadgeReceivers = v.InferOutput<typeof badgeReceivers>;

const badgeReceivers = v.array(
	v.object({
		badgeId: id,
		tournamentTeamId: id,
		userIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(50)),
	}),
);

export type TournamentTrophyReceiver = v.InferOutput<typeof trophyReceiver>;

const trophyReceiver = v.object({
	trophyId: id,
	userIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(50)),
});

export const finalizeTournamentActionSchema = v.object({
	_action: _action("FINALIZE_TOURNAMENT"),
	badgeReceivers: v.optional(
		preprocess(safeJSONParse, v.nullish(badgeReceivers)),
	),
	trophyReceiver: v.optional(
		preprocess(safeJSONParse, v.nullish(trophyReceiver)),
	),
});
