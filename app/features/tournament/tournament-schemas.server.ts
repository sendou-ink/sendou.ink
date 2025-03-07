import { z } from "zod";
import {
	_action,
	checkboxValueToBoolean,
	id,
	modeShort,
	optionalId,
	safeJSONParse,
	stageId,
} from "~/utils/zod";
import { bracketIdx } from "../tournament-bracket/tournament-bracket-schemas.server";
import { TOURNAMENT } from "./tournament-constants";

export const teamName = z
	.string()
	.trim()
	.min(1)
	.max(TOURNAMENT.TEAM_NAME_MAX_LENGTH);

export const registerSchema = z.union([
	z.object({
		_action: _action("UPSERT_TEAM"),
		teamName,
		prefersNotToHost: z.preprocess(checkboxValueToBoolean, z.boolean()),
		noScreen: z.preprocess(checkboxValueToBoolean, z.boolean()),
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
