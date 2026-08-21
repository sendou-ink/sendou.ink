import * as v from "valibot";
import {
	_action,
	id,
	modeShort,
	preprocess,
	safeJSONParse,
	stageId,
} from "~/utils/schema";

export const checkInSchema = v.object({
	_action: _action("CHECK_IN"),
});

export const updateMapPoolSchema = v.object({
	_action: _action("UPDATE_MAP_POOL"),
	mapPool: preprocess(
		safeJSONParse,
		v.array(v.object({ stageId, mode: modeShort })),
	),
});

export const addPlayerSchema = v.object({
	_action: _action("ADD_PLAYER"),
	userId: id,
});

export const deleteTeamMemberSchema = v.object({
	_action: _action("DELETE_TEAM_MEMBER"),
	userId: id,
});

export const saveTournamentSchema = v.union([
	v.object({
		_action: _action("SAVE_TOURNAMENT"),
	}),
	v.object({
		_action: _action("UNSAVE_TOURNAMENT"),
	}),
]);
