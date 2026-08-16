import { z } from "zod";
import { _action, id, modeShort, safeJSONParse, stageId } from "~/utils/zod";

export const checkInSchema = z.object({
	_action: _action("CHECK_IN"),
});

export const updateMapPoolSchema = z.object({
	_action: _action("UPDATE_MAP_POOL"),
	mapPool: z.preprocess(
		safeJSONParse,
		z.array(z.object({ stageId, mode: modeShort })),
	),
});

export const addPlayerSchema = z.object({
	_action: _action("ADD_PLAYER"),
	userId: id,
});

export const deleteTeamMemberSchema = z.object({
	_action: _action("DELETE_TEAM_MEMBER"),
	userId: id,
});

export const saveTournamentSchema = z.union([
	z.object({
		_action: _action("SAVE_TOURNAMENT"),
	}),
	z.object({
		_action: _action("UNSAVE_TOURNAMENT"),
	}),
]);
