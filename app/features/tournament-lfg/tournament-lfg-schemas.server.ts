import { z } from "zod";
import { _action, checkboxValueToBoolean, falsyToNull, id } from "~/utils/zod";
import { TOURNAMENT_LFG } from "./tournament-lfg-constants";
import { joinQueueFormSchema } from "./tournament-lfg-schemas";

export const lookingSchema = z.union([
	joinQueueFormSchema,
	z.object({
		_action: _action("LIKE"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("UNLIKE"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("ACCEPT"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("GIVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("UPDATE_NOTE"),
		value: z.preprocess(
			falsyToNull,
			// xxx: use SendouForm style? (but would need SQ to be migrated too)
			z.string().max(TOURNAMENT_LFG.PUBLIC_NOTE_MAX_LENGTH).nullable(),
		),
	}),
	z.object({
		_action: _action("UPDATE_STAY_AS_SUB"),
		value: z.preprocess(checkboxValueToBoolean, z.boolean()),
	}),
	z.object({
		_action: _action("LEAVE_GROUP"),
	}),
]);
