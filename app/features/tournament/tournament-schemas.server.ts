import { z } from "zod";
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
import { TOURNAMENT } from "./tournament-constants";

const teamName = safeStringSchema({
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
	z.object({
		_action: _action("SAVE_TOURNAMENT"),
	}),
	z.object({
		_action: _action("UNSAVE_TOURNAMENT"),
	}),
]);

export const tournamentSearchSearchParamsSchema = z.object({
	q: z.string().max(100),
	limit: z.coerce.number().int().min(1).max(25).catch(25),
	minStartTime: z.coerce.date().optional().catch(undefined),
});
