import { z } from "zod";
import { _action, checkboxValueToBoolean, falsyToNull, id } from "~/utils/zod";
import { TOURNAMENT_LFG } from "./tournament-lfg-constants";

export const lookingSchema = z.union([
	z.object({
		_action: _action("JOIN_QUEUE"),
		// xxx: use SendouForm style
		stayAsSub: z.preprocess(checkboxValueToBoolean, z.boolean().optional()),
	}),
	z.object({
		_action: _action("LIKE"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("UNLIKE"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("ACCEPT"),
		targetGroupId: id,
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
